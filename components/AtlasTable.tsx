import _ from 'lodash';
import { NextRouter } from 'next/router';
import Tooltip from 'rc-tooltip';
import React from 'react';
import { getDefaultDataTableStyle } from '../lib/dataTableHelpers';
import { AtlasX, Entity, setTab } from '../lib/helpers';
import EnhancedDataTable from './EnhancedDataTable';
import { observer } from 'mobx-react';
import { action, computed, makeObservable, observable } from 'mobx';
import classNames from 'classnames';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBook, faDownload } from '@fortawesome/free-solid-svg-icons';
import { ExploreTab } from './ExploreTabs';
import { Button, Modal } from 'react-bootstrap';
import { ISelectedFiltersByAttrName } from '../lib/types';

interface IAtlasTableProps {
    router: NextRouter;
    synapseAtlasData: AtlasX[];
    selectedAtlases?: AtlasX[];
    filteredAtlases?: AtlasX[];
    onSelectAtlas?: (selected: AtlasX[]) => void;
    selectedFiltersByAttrName: ISelectedFiltersByAttrName;
    filteredCases: Entity[];
    filteredBiospecimens: Entity[];
}

const ViewerLink = (props: { url: string; tooltip: string; children: React.ReactNode }) => (
    <Tooltip overlay={props.tooltip} placement="top">
      <a
        href={props.url}
        target="_blank"
        style={{
          paddingRight: 8,
          textDecoration: 'none',
        }}
      >
        {props.children}
      </a>
    </Tooltip>
  );
  
// Create specific ViewerLink components
const MinervaStoryViewerLink = (props: { url: string }) => (
  <ViewerLink url={props.url} tooltip="Minerva Story">
    <div style={{ padding: '10px' }}>
    <img
      width={40}
      src="https://user-images.githubusercontent.com/1334004/156241219-a3062991-ba9d-4201-ad87-3c9c1f0c61d8.png"
    />
    </div>
  </ViewerLink>
);

const AutoMinervaViewerLink = (props: { url: string }) => (
  <ViewerLink url={props.url} tooltip="Autominerva">
    <img
      width={40}
      src="https://user-images.githubusercontent.com/1334004/159789346-b647c772-48fe-4652-8d2b-3eecf6690f1f.png"
    />
  </ViewerLink>
);

const CBioPortalViewerLink = (props: { url: string }) => (
  <ViewerLink url={props.url} tooltip="cBioPortal">
  <div style={{ padding: '30px' }}>
    <img
      width={50}
      src={'https://docs.cbioportal.org/images/cbio-logo.png'}
    />
  </div>
  </ViewerLink>
);

const CellxgeneViewerLink = (props: { url: string }) => (
  <ViewerLink url={props.url} tooltip="cellxgene">
      <div style={{ padding: '30px' }}>
    <img
      width={40}
      src={
        'https://pbs.twimg.com/profile_images/1285714433981812736/-wuBO62N_400x400.jpg'
      }
    />
    </div>
  </ViewerLink>
);

const BroadSingleCellPortalViewerLink = (props: { url: string }) => (
  <ViewerLink url={props.url} tooltip="Broad Single Cell Portal">
    <img
      width={40}
      src={
        'https://user-images.githubusercontent.com/1334004/171445636-2458ddf6-ce48-4f1f-ab7d-d56487b34ef0.png'
      }
    />
  </ViewerLink>
);

type AtlasTableData = AtlasX & { isSelected: boolean };

@observer
export default class AtlasTable extends React.Component<IAtlasTableProps> {
    @observable metadataModalAtlas: AtlasX | null = null;

    @computed
    get selectedAtlases() {
        return _.keyBy(this.props.selectedAtlases || [], (a) => a.atlas_id);
    }

    @computed get hasAtlasesSelected() {
        return (this.props.selectedAtlases || []).length > 0;
    }

    constructor(props: IAtlasTableProps) {
        super(props);
        makeObservable(this);
    }

    isRowSelected = (atlas: AtlasX) => {
        return this.selectedAtlases[atlas.atlas_id] !== undefined;
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
                name: 'Project',
                selector: (atlas: AtlasX) => (
                    <a
                        href={`https://synapse.org/#!Synapse:${atlas.atlas_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        {atlas.atlas_name}
                    </a>
                ),
                grow: 2,
                wrap: true,
                sortable: true,
            },
            {
                name: 'Investigator',
                selector: (atlas: AtlasX) => atlas.team_name,
                grow: 1.25,
                wrap: true,
                sortable: true,
            },
            {
                name: 'Project Status',
                selector: (atlas: AtlasX) => atlas.status,
                grow: 1.5,
                wrap: false,
                sortable: true,
            },
            // We don't have multiple publications per project yet
            {
                name: 'Publication',
                selector: 'publication',
                cell: (atlas: AtlasX) => (
                    atlas.publication? <><a target="_blank" href={atlas.publication[0]}><FontAwesomeIcon icon={faBook} size="2x"/></a></> : ''
                ),
                grow: 1,
                wrap: true,
                sortable: true,
            },
            // TODO include names of datasets
            {
                name: 'Data Types',
                selector: '',
                cell: (atlas: AtlasX) => {
                    return (
                        <p>{atlas.datasets.map(d => (<a target="_blank" href={"https://www.synapse.org/#!Synapse:"+ d}>{d}, </a>))}</p>
                    )
                },
                grow: 1.25,
                wrap: true,
                sortable: false,
            },
            {
                name: 'Patients',
                grow: 0.5,
                selector: 'num_cases',
                cell: (atlas: AtlasX) => (
                    <span className="ml-auto">
                        {this.shouldShowFilteredFractions
                            ? `${
                                  (
                                      this.filteredCasesByAtlas[
                                          atlas.atlas_id
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
                name: 'External Tools',
                selector: 'atlas_id', // dummy selector - you need to put something or else nothing will render
                grow: 1.5,
                cell: (atlas: AtlasX) => {
                    if (atlas.atlas_id === 'syn51755918') {
                        return (
                            <>
                                <CellxgeneViewerLink
                                    url={
                                        'https://cellxgene.cziscience.com/collections/99f1515b-46a2-4bc4-94c3-f62659dc1eb4'
                                    }
                                />
                                <BroadSingleCellPortalViewerLink
                                    url={
                                        'https://singlecell.broadinstitute.org/single_cell/study/SCP1731/'
                                    }
                                />
                            </>
                        );
                    } else if (atlas.atlas_id === 'syn51755921') {
                        return (
                            <CBioPortalViewerLink
                                url={
                                    'https://triage.cbioportal.mskcc.org/study/summary?id=ovarian_drapkin_2022'
                                }
                            />
                        );
                    } else if (atlas.atlas_id === 'syn52047509') {
                        return (
                            <CBioPortalViewerLink
                                url={
                                    'https://triage.cbioportal.mskcc.org/study/summary?id=brca_ellisen_2022'
                                }
                            />
                        );
                    } else {
                        return null;
                    }
                },
            },
        ];
    }

    @action
    onSelect = (state: {
        allSelected: boolean;
        selectedCount: number;
        selectedRows: AtlasX[];
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
