import _ from 'lodash';
import React from 'react';
import { DataSchemaData, SchemaDataId } from '../lib/dataSchemaHelpers';
import {
    generateColumnsForDataSchema,
    getAtlasColumn,
    getDefaultDataTableStyle,
    sortByBiospecimenId,
    sortByParentId,
} from '../lib/dataTableHelpers';
import { AtlasX, Entity } from '../lib/helpers';
import EnhancedDataTable from './EnhancedDataTable';

interface IBiospecimenTableProps {
    samples: Entity[];
    synapseAtlases: AtlasX[];
    schemaDataById?: { [schemaDataId: string]: DataSchemaData };
}

export const BiospecimenTable: React.FunctionComponent<IBiospecimenTableProps> = (
    props
) => {
    const columns = generateColumnsForDataSchema(
        [SchemaDataId.Biospecimen],
        props.schemaDataById,
        // need to add a custom sort function for the id
        {
            BiospecimenID: {
                sortFunction: sortByBiospecimenId,
            },
            ParentID: {
                sortFunction: sortByParentId,
            },
        },
        // Component seems to be always "Biospecimen", no need to have a column for it
        ['Component']
    );
    const indexOfBiospecimenId = _.findIndex(
        columns,
        (c) => c.id === 'Biospecimen ID'
    );

    columns.splice(
        indexOfBiospecimenId,
        0,
        getAtlasColumn(props.synapseAtlases)
    );

    return (
        <EnhancedDataTable
            defaultSortField={'BiospecimenID'}
            columns={columns}
            data={props.samples}
            striped={true}
            dense={false}
            noHeader={true}
            pagination={true}
            paginationPerPage={50}
            paginationRowsPerPageOptions={[10, 20, 50, 100, 500]}
            customStyles={getDefaultDataTableStyle()}
        />
    );
};

export default BiospecimenTable;
