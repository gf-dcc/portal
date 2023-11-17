import React from 'react';
import _ from 'lodash';
import pluralize from 'pluralize';

import { AttributeNames } from '../lib/types';
import { Entity } from '../lib/helpers';

pluralize.addPluralRule(/specimen$/i, 'specimens');

interface IExploreSummaryProps {
    filteredFiles: Entity[];
    filteredBiospecimenCount: number;
    filteredCaseCount: number;
    getGroupsByPropertyFiltered: any;
}

export const ExploreSummary: React.FunctionComponent<IExploreSummaryProps> = (
    props
) => {
    const atlasCount = _.keys(
        props.getGroupsByPropertyFiltered[AttributeNames.AtlasName]
    ).length;

    const cancerTypeCount = _.keys(
        props.getGroupsByPropertyFiltered[AttributeNames.PrimaryDiagnosis]
    ).length;

    const assayCount = _.keys(
        props.getGroupsByPropertyFiltered[AttributeNames.assayName]
    ).length;

    const fileCount = props.filteredFiles.length;

    return (
        <>
            <div className={'summary'}>
                <div>
                    <strong>Summary:</strong>
                </div>

                <div>{pluralize('Team', atlasCount, true)}</div>
                <div>{pluralize('Patient', props.filteredCaseCount, true)}</div>
                <div>
                {props.filteredBiospecimenCount === 1
                    ? 'Biospecimen'
                    : 'Biospecimens'}: {props.filteredBiospecimenCount}      
                </div>
                <div>{pluralize('Assay', assayCount, true)}</div>
                <div>{pluralize('File', fileCount, true)}</div>
            </div>
        </>
    );
};
