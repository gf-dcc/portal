import _ from 'lodash';
import {
    action,
    computed,
    makeObservable,
    observable,
    runInAction,
} from 'mobx';
import { observer } from 'mobx-react';
import { fromPromise, IPromiseBasedObservable } from 'mobx-utils';
import { withRouter, NextRouter } from 'next/router';
import fetch from 'node-fetch';
import React from 'react';
import { ScaleLoader } from 'react-spinners';

import {
    filterFiles,
    getFilteredCases,
    getFilteredSamples,
    groupFilesByAttrNameAndValue,
} from '../lib/filterHelpers';
import {
    AtlasDataset,
    Entity,
    fetchData,
    fillInEntities,
    filterObject,
    LoadDataResult,
    parseSelectedFiltersFromUrl,
    updateSelectedFiltersInURL,
} from '../lib/helpers';
import {
    AttributeMap,
    AttributeNames,
    ExploreActionMeta,
    ExploreSelectedFilter,
    FilterAction,
    IFilterProps,
    ISelectedFiltersByAttrName,
} from '../lib/types';

import PreReleaseBanner from '../components/PreReleaseBanner';
import FilterControls from '../components/filter/FilterControls';
import Filter from '../components/filter/Filter';
import ExploreTabs, { ExploreTab } from '../components/ExploreTabs';

import styles from './styles.module.scss';
import { ExploreSummary } from '../components/ExploreSummary';
import PageWrapper from '../components/PageWrapper';
import { DataSchemaData, getSchemaDataMap } from '../lib/dataSchemaHelpers';

export type ExploreURLQuery = {
    selectedFilters: string | undefined;
    tab: ExploreTab;
};

@observer
class Search extends React.Component<{ router: NextRouter }, IFilterProps> {
    @observable.ref private dataLoadingPromise:
        | IPromiseBasedObservable<LoadDataResult>
        | undefined;
    @observable private showAllBiospecimens = false;
    @observable private showAllCases = false;

    constructor(props: any) {
        super(props);

        this.state = {
            files: [],
            filters: {},
            atlasDatasets: [],
            schemaDataById: {},
        };

        //@ts-ignore
        if (typeof window !== 'undefined') (window as any).me = this;

        makeObservable(this);
    }

    @action.bound toggleShowAllBiospecimens() {
        this.showAllBiospecimens = !this.showAllBiospecimens;
    }
    @action.bound toggleShowAllCases() {
        this.showAllCases = !this.showAllCases;
    }

    get selectedFilters(): ExploreSelectedFilter[] {
        return (
            parseSelectedFiltersFromUrl(
                (this.props.router.query as ExploreURLQuery).selectedFilters // use casting as ExploreURLQuery to use typescript to ensure URL correctness
            ) || []
        );
    }

    get getGroupsByProperty() {
        return groupFilesByAttrNameAndValue(this.state.files);
    }

    get getGroupsByPropertyFiltered() {
        return groupFilesByAttrNameAndValue(this.filteredFiles);
    }

    @computed
    get selectedFiltersByAttrName(): ISelectedFiltersByAttrName {
        return _.chain(this.selectedFilters)
            .groupBy((item) => item.group)
            .mapValues((filters: ExploreSelectedFilter[]) => {
                return new Set(filters.map((f) => f.value));
            })
            .value();
    }

    @action.bound
    setFilter(actionMeta: ExploreActionMeta<ExploreSelectedFilter>) {
        let newFilters: ExploreSelectedFilter[] = this.selectedFilters;
        switch (actionMeta.action) {
            case FilterAction.CLEAR_ALL:
                // Deselect all filters
                newFilters = [];
                break;
            case FilterAction.CLEAR:
                if (actionMeta.option) {
                    // Deselect all options for the given group
                    newFilters = this.selectedFilters.filter((o) => {
                        return o.group !== actionMeta.option!.group;
                    });
                }
                break;
            case FilterAction.SELECT:
            case FilterAction.DESELECT:
                if (actionMeta.option) {
                    // first remove the item
                    newFilters = this.selectedFilters.filter((o) => {
                        return (
                            o.group !== actionMeta.option!.group! ||
                            o.value !== actionMeta.option!.value!
                        );
                    });
                    if (actionMeta.action === 'select-option') {
                        // Add it back if selecting
                        const option = actionMeta.option;
                        newFilters = newFilters.concat([option]);
                    }
                }
                break;
        }

        updateSelectedFiltersInURL(newFilters, this.props.router);
    }

    @action.bound
    onSelectAtlas(selected: AtlasDataset[]) {
        const group = AttributeNames.AtlasName;

        // remove all previous atlas filters
        const newFilters: ExploreSelectedFilter[] =
            this.selectedFilters.filter((f) => f.group !== group) || [];

        // add the new ones
        newFilters.push(
            ...selected.map((a) => ({ group, value: a.team_name }))
        );

        updateSelectedFiltersInURL(newFilters, this.props.router);
    }

    componentDidMount(): void {
        runInAction(() => {
            this.dataLoadingPromise = fromPromise(fetchData());
            this.dataLoadingPromise.then((data) => {
                this.setState({
                    files: fillInEntities(data),
                    atlasDatasets: data.atlasDatasets,
                });
            });

            const schemaLoadingPromise = fromPromise(getSchemaDataMap());
            schemaLoadingPromise.then((schemaDataById) => {
                this.setState({ schemaDataById });
            });
        });
    }

    @computed
    get filteredFiles() {
        const ret = filterFiles(
            this.selectedFiltersByAttrName,
            this.state.files
        );
        return ret;
    }

    @computed
    get filteredFilesByNonAtlasFilters() {
        return filterFiles(
            this.nonAtlasSelectedFiltersByAttrName,
            this.state.files
        );
    }

    @computed
    get filteredSamples() {
        return getFilteredSamples(
            this.filteredFiles,
            this.filteredCases,
            this.showAllBiospecimens
        );
    }

    @computed
    get filteredSamplesByNonAtlasFilters() {
        return getFilteredSamples(
            this.filteredFilesByNonAtlasFilters,
            this.filteredCasesByNonAtlasFilters,
            this.showAllBiospecimens
        );
    }

    @computed
    get filteredCases() {
        return getFilteredCases(
            this.filteredFiles,
            this.selectedFiltersByAttrName,
            this.showAllCases
        );
    }

    @computed
    get filteredCasesByNonAtlasFilters() {
        return getFilteredCases(
            this.filteredFilesByNonAtlasFilters,
            this.nonAtlasSelectedFiltersByAttrName,
            this.showAllCases
        );
    }

    @computed get atlasMap() {
        return _.keyBy(this.state.atlasDatasets, (a) => a.team_id);
    }

    @computed
    get filteredAtlases() {
        // get only atlases associated with filtered files
        return _.chain(this.filteredFiles)
            .map((f) => f.atlas_id)
            .uniq()
            .map((id) => this.atlasMap[id])
            .value();
    }

    @computed
    get selectedAtlases() {
        const atlasFilters = this.selectedFiltersByAttrName[
            AttributeNames.AtlasName
        ];

        if (_.size(atlasFilters)) {
            return _.chain(
                filterFiles(
                    { [AttributeNames.AtlasName]: atlasFilters },
                    this.state.files
                )
            )
                .map((f) => f.atlas_id)
                .uniq()
                .map((id) => this.atlasMap[id])
                .value();
        } else {
            return [];
        }
    }

    @computed get nonAtlasSelectedFiltersByAttrName() {
        return _.omit(this.selectedFiltersByAttrName, [
            AttributeNames.AtlasName,
        ]);
    }

    @computed
    get filteredAtlasesByNonAtlasFilters() {
        const filtersExceptAtlasFilters = this
            .nonAtlasSelectedFiltersByAttrName;

        return _.chain(filterFiles(filtersExceptAtlasFilters, this.state.files))
            .map((f) => f.atlas_id)
            .uniq()
            .map((id) => this.atlasMap[id])
            .value();
    }

    @computed
    get allAtlases() {
        return _.chain(this.state.files)
            .map((f) => f.atlas_id)
            .uniq()
            .map((id) => this.atlasMap[id])
            .value();
    }

    render() {
        if (
            !this.dataLoadingPromise ||
            this.dataLoadingPromise.state === 'pending'
        ) {
            return (
                <div className={styles.loadingIndicator}>
                    <ScaleLoader />
                </div>
            );
        }

        if (this.filteredFiles) {
            return (
                <div className={'explorePageWrapper'}>
                    <FilterControls
                        setFilter={this.setFilter}
                        selectedFiltersByGroupName={
                            this.selectedFiltersByAttrName
                        }
                        selectedFilters={this.selectedFilters}
                        files={this.state.files}
                        getGroupsByProperty={this.getGroupsByProperty}
                    />

                    <Filter
                        setFilter={this.setFilter}
                        selectedFiltersByGroupName={
                            this.selectedFiltersByAttrName
                        }
                    />

                    <ExploreSummary
                        filteredFiles={this.filteredFiles}
                        getGroupsByPropertyFiltered={
                            this.getGroupsByPropertyFiltered
                        }
                        filteredBiospecimenCount={this.filteredSamples.length}
                        filteredCaseCount={this.filteredCases.length}
                    />

                    <ExploreTabs
                        router={this.props.router}
                        schemaDataById={this.state.schemaDataById}
                        filteredFiles={this.filteredFiles}
                        filteredSynapseAtlases={this.filteredAtlases}
                        filteredSynapseAtlasesByNonAtlasFilters={
                            this.filteredAtlasesByNonAtlasFilters
                        }
                        selectedSynapseAtlases={this.selectedAtlases}
                        allSynapseAtlases={this.allAtlases}
                        onSelectAtlas={this.onSelectAtlas}
                        samples={this.filteredSamples}
                        cases={this.filteredCases}
                        filteredCasesByNonAtlasFilters={
                            this.filteredCasesByNonAtlasFilters
                        }
                        filteredSamplesByNonAtlasFilters={
                            this.filteredSamplesByNonAtlasFilters
                        }
                        nonAtlasSelectedFiltersByAttrName={
                            this.nonAtlasSelectedFiltersByAttrName
                        }
                        getGroupsByPropertyFiltered={
                            this.getGroupsByPropertyFiltered
                        }
                        showAllBiospecimens={this.showAllBiospecimens}
                        showAllCases={this.showAllCases}
                        toggleShowAllBiospecimens={
                            this.toggleShowAllBiospecimens
                        }
                        toggleShowAllCases={this.toggleShowAllCases}
                    />
                </div>
            );
        }
    }
}

interface IFilterPageProps {
    router: NextRouter;
}

const FilterPage = (props: IFilterPageProps) => {
    return (
        <>
            <PageWrapper>
                <Search router={props.router} />
            </PageWrapper>
        </>
    );
};

export default withRouter(FilterPage);
