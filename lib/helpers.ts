import _ from 'lodash';
import { NextRouter } from 'next/router';
import fetch from 'node-fetch';
import * as Path from 'path';
import { toArabic } from 'roman-numerals';

import {
    ExploreOptionType,
    ExploreSelectedFilter,
    ISelectedFiltersByAttrName,
    SynapseAtlas,
    SynapseData,
    SynapseSchema,
} from './types';
import { ExploreURLQuery } from '../pages/explore';
import { ExploreTab } from '../components/ExploreTabs';

// @ts-ignore
let win;

if (typeof window !== 'undefined') {
    win = window as any;
} else {
    win = {} as any;
}

export type SynapseId = string;
export type BiospecimenID = string;
export type ParticipantID = string;

export interface BaseSerializableEntity {
    // Synapse attribute names
    AJCCPathologicStage: string;
    Biospecimen: string;
    Component: string;
    ParentID: string;
    BiospecimenID: string;
    ParentBiospecimenID: string;
    ParentDataFileID: string;
    PrimaryDiagnosis: string;
    AgeatDiagnosis: number;
    fileFormat: string;
    filename: string;
    ParticipantID: string;
    ImagingAssayType?: string;
    AssayType?: string;
    Race: string;
    Ethnicity: string;
    Sex: string;

    // Derived or attached in frontend
    atlas_id: string;
    atlas_name: string;
    dataset_id: string;
    level: string;
    assayName?: string;
    primaryParents?: SynapseId[];
    synapseId?: SynapseId;
}

export interface SerializableEntity extends BaseSerializableEntity {
    biospecimenIds: BiospecimenID[];
    diagnosisIds: ParticipantID[];
    demographicsIds: ParticipantID[];
}

// Entity links in some referenced objects, which will help
//  for search/filter efficiency, and adds `cases` member.
export interface Entity extends SerializableEntity {
    biospecimen: Entity[];
    diagnosis: Entity[];
    demographics: Entity[];
    cases: Entity[];
}

export type Atlas = {
    atlas_id: string;
    atlas_name: string;
    atlas_description: string;
    team_id: string;
    team_name: string;
    num_datasets: number;
    num_cases: number;
    num_biospecimens: number
};

export interface AtlasX extends Atlas {
    datasets: string[]; // we will want to actually include dataset accessions contained in this atlas, not just summary num_datasets
    publication: string[];
    status: string;
    governance: string; // surface useful GF-specific classification
};


export interface LoadDataResult {
    files: SerializableEntity[];
    superatlas: any, // currently not used yet since we still rely on dashboard helper
    atlases: AtlasX[];
    biospecimenByBiospecimenID: {
        [BiospecimenID: string]: SerializableEntity;
    };
    diagnosisByParticipantID: {
        [ParticipantID: string]: SerializableEntity;
    };
    demographicsByParticipantID: {
        [ParticipantID: string]: SerializableEntity;
    };
}

win.missing = [];

function doesFileHaveMultipleParents(file: Entity) {
    return /Level[456]/.test(file.Component);
}

export function doesFileIncludeLevel1OrLevel2SequencingData(file: Entity) {
    return (
        !file.Component.startsWith('Imaging') &&
        (file.level === 'Level 1' || file.level === 'Level 2')
    );
}

function mergeCaseData(
    diagnosis: Entity[],
    demographicsByParticipantID: { [ParticipantID: string]: Entity }
) {
    return diagnosis.map((d) => ({
        ...d,
        ...demographicsByParticipantID[d.ParticipantID],
    }));
}

export async function fetchData(): Promise<LoadDataResult> {
    // in development we use local processed syn data. In production we use
    // other URL (too large to serve thru next max 250MB limit)
    const processedSynURL = '/processed_syn_data.json';
    const res = await fetch(processedSynURL);

    // const json = await res.json();
    const text = await res.text();
    const json = JSON.parse(text);

    return json as LoadDataResult;
}

export function fillInEntities(data: LoadDataResult): Entity[] {
    const biospecimenMap = data.biospecimenByBiospecimenID;
    const diagnosisMap = data.diagnosisByParticipantID;
    const demoMap = data.demographicsByParticipantID;

    // give each biospecimen it's caseid (i.e "diagnosis" ParticipantID)
    // biospecimen have ParentID but that may or may not be it's caseid because
    // biospecimen can have other biospecimen as parents (one case at top)
    _.forEach(data.biospecimenByBiospecimenID, (specimen) => {
        const parentIdMatch = specimen.ParentID.match(/[^_]*_[^_]*/);
        // we should always have a match
        specimen.ParticipantID =
            specimen.ParticipantID ||
            (parentIdMatch ? parentIdMatch[0] : '');
    });

    data.files.forEach((file) => {
        (file as Entity).biospecimen = file.biospecimenIds.map(
            (id) => biospecimenMap[id] as Entity
        );
        (file as Entity).diagnosis = file.diagnosisIds.map(
            (id) => diagnosisMap[id] as Entity
        );
        (file as Entity).demographics = file.demographicsIds.map(
            (id) => demoMap[id] as Entity
        );
        (file as Entity).cases = _.uniqBy(
            mergeCaseData(
                (file as Entity).diagnosis,
                demoMap as { [id: string]: Entity }
            ),
            (c) => c.ParticipantID
        );
    });

    return data.files as Entity[];
}

export function sortStageOptions(options: ExploreOptionType[]) {
    const sortedOptions = _.sortBy(options, (option) => {
        const numeral = option.value.match(/stage ([IVXLCDM]+)/i);
        let val = undefined;
        if (!!numeral && numeral.length > 1) {
            try {
                const number = toArabic(numeral[1]);
            } catch (ex) {
                val = numeral[1];
            }
        }
        return option.label;
    });

    const withStage = sortedOptions.filter((option) =>
        /stage/i.test(option.label)
    );
    const withoutStage = sortedOptions.filter(
        (option) => !/stage/i.test(option.label)
    );

    return withStage.concat(withoutStage);

    //return options;
}

export function clamp(x: number, lower: number, upper: number) {
    return Math.max(lower, Math.min(x, upper));
}

export function urlEncodeSelectedFilters(
    selectedFilters: ExploreSelectedFilter[]
) {
    return JSON.stringify(selectedFilters);
}
export function parseSelectedFiltersFromUrl(
    selectedFiltersURLQueryParam: string | undefined
): ExploreSelectedFilter[] | null {
    if (selectedFiltersURLQueryParam) {
        return JSON.parse(selectedFiltersURLQueryParam);
    }
    return null;
}

function addQueryStringToURL(
    url: string,
    queryParams: { [key: string]: string | undefined }
) {
    const urlEncoded = _.map(queryParams, (val, key) => {
        if (val) {
            return `${key}=${val}`;
        } else {
            return '';
        }
    }).filter((x) => !!x); // take out empty params

    if (urlEncoded.length > 0) {
        return `${url}?${urlEncoded.join('&')}`;
    } else {
        return url;
    }
}

export function getExplorePageURL(
    tab: ExploreTab,
    filters: ExploreSelectedFilter[]
) {
    let url = '/explore';
    if (filters.length > 0) {
        const query: ExploreURLQuery = {
            selectedFilters: urlEncodeSelectedFilters(filters),
            tab,
        }; // using this intermediate container to use typescript to enforce URL correctness
        url = addQueryStringToURL(url, query);
    }
    return url;
}

export function getAtlasPageURL(id: string) {
    return `/atlas/${id}`;
}

export function updateSelectedFiltersInURL(
    filters: ExploreSelectedFilter[],
    router: NextRouter
) {
    router.push(
        {
            pathname: router.pathname,
            query: Object.assign({}, router.query, {
                selectedFilters: urlEncodeSelectedFilters(filters),
            }),
        },
        undefined,
        { shallow: true }
    );
}

export function setTab(tab: string, router: NextRouter) {
    router.push(
        {
            pathname: router.pathname,
            query: Object.assign({}, router.query, { tab }),
        },
        undefined,
        { shallow: true }
    );
}

export type AtlasReport = {
    description: string;
    text: string;
};

export function computeDashboardData(atlases: AtlasX[]): AtlasReport[] {

    return [
        { description: 'Atlases', text: atlases.length.toString() },
        { description: 'Datasets', text: atlases.map(a => a.num_datasets).reduce((a, b) => a + b, 0).toString() },
        { description: 'Cases', text: atlases.map(a => a.num_cases).reduce((a, b) => a + b, 0).toString() },
        { description: 'Biospecimens', text: atlases.map(a => a.num_biospecimens).reduce((a, b) => a + b, 0).toString() },
    ];
}

export function getFileBase(filename: string) {
    return Path.basename(filename);
}

export function getFileExtension(filename: string) {
    return Path.extname(filename);
}

export function getFilenameWithoutExtension(base: string) {
    return base.includes('.') ? base.slice(0, base.lastIndexOf('.')) : base;
}

export function truncateFilename(
    filename: string,
    leadThreshold: number = 10,
    trailThreshold: number = 5
) {
    const base = getFileBase(filename);
    const ext = getFileExtension(filename);
    const name = getFilenameWithoutExtension(base);

    let displayValue = base;

    if (name.length > leadThreshold + trailThreshold) {
        // get the first <leadThreshold> characters of the name
        const lead = name.slice(0, leadThreshold);
        // get the last <trailThreshold> characters of the name
        const trail = name.slice(-trailThreshold);
        // always keep the extension (everything after the last dot)
        displayValue = `${lead}...${trail}${ext}`;
    }

    return displayValue;
}

export function convertAgeInDaysToYears(ageInDays: number) {
    return Math.round(ageInDays / 365);
}

export function filterObject(
    object: any,
    filter: (val: any, key: any) => boolean
) {
    const filteredObj: any = {};
    _.forEach(object, (val, key) => {
        if (filter(val, key)) {
            filteredObj[key] = val;
        }
    });
    return filteredObj;
}

export function selectorToColumnName(selector: string) {
    // capitalize first letter always
    let str = `${selector[0].toUpperCase()}${selector.substr(1)}`;
    // insert a space before each capital letter that has a lower case letter after it
    str = str.replace(/([A-Z])(?=[a-z])/g, ' $1');
    // insert a space after each lower case letter that has a capital after it
    str = str.replace(/([a-z])(?=[A-Z])/g, '$1 ');
    // remove any trailing spaces
    str = str.trim();

    return str;
}
