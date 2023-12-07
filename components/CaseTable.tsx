import _ from 'lodash';
import React from 'react';
import { DataSchemaData, SchemaDataId } from '../lib/dataSchemaHelpers';
import {
    generateColumnsForDataSchema,
    getAtlasColumn,
    getDefaultDataTableStyle,
    sortByParticipantId,
} from '../lib/dataTableHelpers';
import { AtlasX, convertAgeInDaysToYears, Entity } from '../lib/helpers';
import EnhancedDataTable from './EnhancedDataTable';

interface ICaseTableProps {
    cases: Entity[];
    synapseAtlases: AtlasX[];
    schemaDataById?: { [schemaDataId: string]: DataSchemaData };
}

export const CaseTable: React.FunctionComponent<ICaseTableProps> = (props) => {
    const columns = generateColumnsForDataSchema(
        [SchemaDataId.Diagnosis, SchemaDataId.Demographics],
        props.schemaDataById,
        // need to add a custom sort function for the id
        {
            ParticipantID: {
                sortFunction: sortByParticipantId,
            },
            AgeatDiagnosis: {
                // we need to customize both the name and the tooltip since we convert days to years
                name: 'Age at Diagnosis (years)',
                headerTooltip:
                    'Age at the time of diagnosis expressed in number of years since birth.',
                format: (sample: Entity) =>
                    convertAgeInDaysToYears(sample.AgeatDiagnosis),
                cell: (sample: Entity) => (
                    <span className="ml-auto">
                        {convertAgeInDaysToYears(sample.AgeatDiagnosis)}
                    </span>
                ),
            },
        },
        // Component seems to be always "Diagnosis", no need to have a column for it
        ['Component']
    );
    const indexOfParticipantId = _.findIndex(
        columns,
        (c) => c.id === 'Participant ID'
    );
    // insert Atlas Name right after Participant ID
    columns.splice(
        indexOfParticipantId + 1,
        0,
        getAtlasColumn(props.synapseAtlases)
    );

    return (
        <EnhancedDataTable
            columns={columns}
            defaultSortField={'ParticipantID'}
            data={props.cases}
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

export default CaseTable;
