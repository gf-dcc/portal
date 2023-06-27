import _ from 'lodash';
import { NextRouter } from 'next/router';
import Tooltip from 'rc-tooltip';
import React from 'react';
import { getDefaultDataTableStyle } from '../lib/dataTableHelpers';
import { AtlasDataset, Entity, setTab } from '../lib/helpers';
import EnhancedDataTable from './EnhancedDataTable';
import { observer } from 'mobx-react';
import { action, computed, makeObservable, observable } from 'mobx';
import classNames from 'classnames';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faDownload } from '@fortawesome/free-solid-svg-icons';
import { ExploreTab } from './ExploreTabs';
import { Button, Modal } from 'react-bootstrap';
import { ISelectedFiltersByAttrName } from '../lib/types';

interface IAtlasTableProps {
    router: NextRouter;
    synapseAtlasData: AtlasDataset[];
    selectedAtlases?: AtlasDataset[];
    filteredAtlases?: AtlasDataset[];
    onSelectAtlas?: (selected: AtlasDataset[]) => void;
    selectedFiltersByAttrName: ISelectedFiltersByAttrName;
    filteredCases: Entity[];
    filteredBiospecimens: Entity[];
}

const MinervaStoryViewerLink = (props: { url: string; count: number }) => (
    <Tooltip overlay="Minerva Story">
        <a
            href={props.url}
            target="_blank"
            style={{
                paddingRight: 8,
                fontFamily: 'monospace',
                textDecoration: 'none',
            }}
        >
            {props.count < 100 && '\u00A0'}
            {props.count < 10 && '\u00A0'}
            {props.count}{' '}
            <img
                width={20}
                src="https://user-images.githubusercontent.com/1334004/156241219-a3062991-ba9d-4201-ad87-3c9c1f0c61d8.png"
            />
        </a>
    </Tooltip>
);

const AutoMinervaViewerLink = (props: { url: string; count: number }) => (
    <Tooltip overlay="Autominerva">
        <a
            href={props.url}
            style={{
                paddingRight: 8,
                fontFamily: 'monospace',
                textDecoration: 'none',
            }}
        >
            {props.count < 100 && '\u00A0'}
            {props.count < 10 && '\u00A0'}
            {props.count}{' '}
            <img
                width={20}
                src="https://user-images.githubusercontent.com/1334004/159789346-b647c772-48fe-4652-8d2b-3eecf6690f1f.png"
            />
        </a>
    </Tooltip>
);

const CBioPortalViewerLink = (props: { url: string; count: number }) => (
    <Tooltip overlay="cBioPortal">
        <a
            href={props.url}
            target="_blank"
            style={{
                paddingRight: 8,
                fontFamily: 'monospace',
                textDecoration: 'none',
            }}
        >
            {props.count < 100 && '\u00A0'}
            {props.count < 10 && '\u00A0'}
            {props.count}{' '}
            <img
                width={20}
                src={'https://avatars.githubusercontent.com/u/9876251?s=20&v=4'}
            />
        </a>
    </Tooltip>
);

const CellxgeneViewerLink = (props: { url: string; count: number }) => (
    <Tooltip overlay="cellxgene">
        <a
            href={props.url}
            target="_blank"
            style={{
                paddingRight: 8,
                fontFamily: 'monospace',
                textDecoration: 'none',
            }}
        >
            {props.count < 100 && '\u00A0'}
            {props.count < 10 && '\u00A0'}
            {props.count}{' '}
            <img
                width={20}
                src={
                    'https://pbs.twimg.com/profile_images/1285714433981812736/-wuBO62N_400x400.jpg'
                }
            />
        </a>
    </Tooltip>
);

const BroadSingleCellPortalViewerLink = (props: {
    url: string;
    count: number;
}) => (
    <Tooltip overlay="Broad Single Cell Portal">
        <a
            href={props.url}
            target="_blank"
            style={{
                paddingRight: 8,
                fontFamily: 'monospace',
                textDecoration: 'none',
            }}
        >
            {props.count < 100 && '\u00A0'}
            {props.count < 10 && '\u00A0'}
            {props.count}{' '}
            <img
                width={20}
                src={
                    'https://user-images.githubusercontent.com/1334004/171445636-2458ddf6-ce48-4f1f-ab7d-d56487b34ef0.png'
                }
            />
        </a>
    </Tooltip>
);

type AtlasTableData = AtlasDataset & { isSelected: boolean };

@observer
export default class AtlasTable extends React.Component<IAtlasTableProps> {
    @observable metadataModalAtlas: AtlasDataset | null = null;

    @computed
    get selectedAtlases() {
        return _.keyBy(this.props.selectedAtlases || [], (a) => a.team_id);
    }

    @computed get hasAtlasesSelected() {
        return (this.props.selectedAtlases || []).length > 0;
    }

    constructor(props: IAtlasTableProps) {
        super(props);
        makeObservable(this);
    }

    isRowSelected = (atlas: AtlasDataset) => {
        return this.selectedAtlases[atlas.team_id] !== undefined;
    };

    // we need to update data every time the selection changes to rerender the table
    // see selectableRowSelected property at https://www.npmjs.com/package/react-data-table-component#row-selection
    @computed get data(): AtlasTableData[] {
        return (this.props.filteredAtlases || this.props.synapseAtlasData).map(
            (a) =>
                ({
                    ...a,
                    isSelected: this.isRowSelected(a),
                } as AtlasTableData)
        );
    }

    @computed get filteredCasesByAtlas() {
        return _.groupBy(this.props.filteredCases, (c: Entity) => c.atlas_id);
    }

    @computed get filteredBiospecimensByAtlas() {
        return _.groupBy(
            this.props.filteredBiospecimens,
            (c: Entity) => c.atlas_id
        );
    }

    @computed get shouldShowFilteredFractions() {
        return !_.isEmpty(this.props.selectedFiltersByAttrName);
    }

    get columns() {
        return [
            {
                name: 'Lab Name',
                selector: (atlas: AtlasDataset) => atlas.team_name,
                grow: 1.25,
                wrap: true,
                sortable: true,
            },
            {
                name: 'Cases',
                grow: 0.5,
                selector: 'num_cases',
                cell: (atlas: AtlasDataset) => (
                    <span className="ml-auto">
                        {this.shouldShowFilteredFractions
                            ? `${
                                  (
                                      this.filteredCasesByAtlas[
                                          atlas.team_id
                                      ] || []
                                  ).length
                              }/`
                            : ''}
                        {atlas.num_cases}
                    </span>
                ),
                sortable: true,
            },
            {
                name: 'Biospecimens',
                selector: 'num_biospecimens',
                cell: (atlas: AtlasDataset) => (
                    <span className="ml-auto">
                        {this.shouldShowFilteredFractions
                            ? `${
                                  (
                                      this.filteredBiospecimensByAtlas[
                                          atlas.team_id
                                      ] || []
                                  ).length
                              }/`
                            : ''}
                        {atlas.num_biospecimens}
                    </span>
                ),
                sortable: true,
            },
            {
                name: 'Viewers',
                selector: 'team_id', // dummy selector - you need to put something or else nothing will render
                grow: 1.5,
                cell: (atlas: AtlasDataset) => {
                    if (atlas.dataset_id === 'syn123') {
                        return (
                            <>
                                <CellxgeneViewerLink
                                    url={
                                        'https://brugge-singlecell.herokuapp.com'
                                    }
                                    count={1}
                                />
                                <BroadSingleCellPortalViewerLink
                                    url={
                                        'https://singlecell.broadinstitute.org/single_cell/study/SCP1731/'
                                    }
                                    count={1}
                                />
                            </>
                        );
                    } else if (atlas.dataset_id === 'syn1234') {
                        return (
                            <CBioPortalViewerLink
                                url={
                                    'https://triage.cbioportal.mskcc.org/study/summary?id=ovarian_drapkin_2022'
                                }
                                count={1}
                            />
                        );
                    } else if (atlas.dataset_id === 'syn12345') {
                        return (
                            <CBioPortalViewerLink
                                url={
                                    'https://triage.cbioportal.mskcc.org/study/summary?id=brca_ellisen_2022'
                                }
                                count={1}
                            />
                        );
                    } else {
                        return null;
                    }
                },
            },
            // {
            //     name: 'Atlas ID',
            //     selector: (atlas: Atlas) => atlas.team_id.toUpperCase(),
            //     wrap: true,
            //     sortable: true,
            // },
        ];
    }

    @action
    onSelect = (state: {
        allSelected: boolean;
        selectedCount: number;
        selectedRows: AtlasDataset[];
    }) => {
        if (this.props.onSelectAtlas) {
            this.props.onSelectAtlas(state.selectedRows);
        }
    };

    @action onViewFiles = (e: any) => {
        e.preventDefault();
        setTab(ExploreTab.FILE, this.props.router);
    };

    render() {
        return (
            <>
                <EnhancedDataTable
                    customControls={
                        <button
                            className={classNames(
                                'btn btn-primary',
                                !this.hasAtlasesSelected ? 'invisible' : ''
                            )}
                            disabled={!this.hasAtlasesSelected}
                            onMouseDown={this.onViewFiles}
                        >
                            <FontAwesomeIcon icon={faDownload} />{' '}
                            {`View files for ${
                                this.props.selectedAtlases?.length
                            } selected ${
                                this.props.selectedAtlases?.length === 1
                                    ? 'atlas'
                                    : 'atlases'
                            }`}
                        </button>
                    }
                    columns={this.columns}
                    defaultSortField={'WPAtlas.lead_institutions'}
                    data={this.data}
                    selectableRows={true}
                    onSelectedRowsChange={this.onSelect}
                    selectableRowSelected={(r: { isSelected: boolean }) =>
                        r.isSelected
                    }
                    striped={true}
                    noHeader={true}
                    customStyles={getDefaultDataTableStyle()}
                />

            </>
        );
    }
}
