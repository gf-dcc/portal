import { SynapseAtlas, SynapseData, SynapseSchema } from '../lib/types';
import { WPAtlas } from '../types';
import _ from 'lodash';
import {
    Atlas,
    BaseSerializableEntity,
    Entity,
    DataFileID,
    LoadDataResult,
    SerializableEntity,
} from '../lib/helpers';
import getData from '../lib/getData';
import fs from 'fs';
import { getAtlasList } from '../ApiUtil';

async function writeProcessedFile() {
    const data = getData();
    const atlases = await getAtlasList();
    const processed: LoadDataResult = processSynapseJSON(data, atlases);
    fs.writeFileSync(
        'public/processed_syn_data.json',
        JSON.stringify(processed)
    );
}

function processSynapseJSON(synapseJson: SynapseData, WPAtlasData: WPAtlas[]) {
    const WPAtlasMap = _.keyBy(WPAtlasData, (a) => a.htan_id.toUpperCase());
    const flatData = extractEntitiesFromSynapseData(synapseJson, WPAtlasMap);

    const files = flatData.filter((obj) => {
        return !!obj.filename;
    });

    const filesByHTANId = _.keyBy(files, (f) => f.DataFileID);

    addPrimaryParents(files);
    const {
        biospecimenByBiospecimenID,
        diagnosisByParticipantID,
        demographicsByParticipantID,
    } = extractBiospecimensAndDiagnosisAndDemographics(flatData);

    const returnFiles = files
        .map((file) => {
            const parentData = getSampleAndPatientData(
                file,
                filesByHTANId,
                biospecimenByBiospecimenID,
                diagnosisByParticipantID,
                demographicsByParticipantID
            );

            (file as SerializableEntity).biospecimenIds = parentData.biospecimen.map(
                (b) => b.BiospecimenID
            );
            (file as SerializableEntity).diagnosisIds = parentData.diagnosis.map(
                (d) => d.ParticipantID
            );
            (file as SerializableEntity).demographicsIds = parentData.demographics.map(
                (d) => d.ParticipantID
            );

            return file as SerializableEntity;
        })
        .filter((f) => f.diagnosisIds.length > 0); // files must have a diagnosis

    // count cases and biospecimens for each atlas
    const filesByAtlas = _.groupBy(returnFiles, (f) => f.atlasid);
    const caseCountByAtlas = _.mapValues(filesByAtlas, (files) => {
        return _.chain(files)
            .flatMapDeep((f) => f.diagnosisIds)
            .uniq()
            .value().length;
    });
    const biospecimenCountByAtlas = _.mapValues(filesByAtlas, (files) => {
        return _.chain(files)
            .flatMapDeep((f) => f.biospecimenIds)
            .uniq()
            .value().length;
    });

    const returnAtlases: Atlas[] = [];
    for (const atlas of synapseJson.atlases) {
        const WPAtlas = WPAtlasMap[atlas.htan_id.toUpperCase()];

        // atlases MUST have an entry in WPAtlas
        if (WPAtlas) {
            returnAtlases.push({
                htan_id: atlas.htan_id,
                htan_name: atlas.htan_name,
                WPAtlas,
                num_biospecimens: biospecimenCountByAtlas[atlas.htan_id],
                num_cases: caseCountByAtlas[atlas.htan_id],
            });
        }
    }

    // filter out files without a diagnosis
    return {
        files: returnFiles,
        atlases: returnAtlases,
        biospecimenByBiospecimenID: biospecimenByBiospecimenID as {
            [BiospecimenID: string]: SerializableEntity;
        },
        diagnosisByParticipantID: diagnosisByParticipantID as {
            [ParticipantID: string]: SerializableEntity;
        },
        demographicsByParticipantID: demographicsByParticipantID as {
            [ParticipantID: string]: SerializableEntity;
        },
    };
}

function addPrimaryParents(files: BaseSerializableEntity[]) {
    const fileIdToFile = _.keyBy(files, (f) => f.DataFileID);

    files.forEach((f) => {
        findAndAddPrimaryParents(f, fileIdToFile);
    });
}

function findAndAddPrimaryParents(
    f: BaseSerializableEntity,
    filesByFileId: { [DataFileID: string]: BaseSerializableEntity }
): DataFileID[] {
    if (f.primaryParents) {
        // recursive optimization:
        //  if we've already calculated f.primaryParents, just return it
        return f.primaryParents;
    }

    // otherwise, compute parents
    let primaryParents: DataFileID[] = [];

    if (f.HTANParentDataFileID) {
        // if there's a parent, traverse "upwards" to find primary parent
        const parentIds = f.HTANParentDataFileID.split(/[,;]/);
        const parentFiles = parentIds.reduce(
            (aggr: BaseSerializableEntity[], id: string) => {
                const file = filesByFileId[id];
                if (file) {
                    aggr.push(file);
                } else {
                    // @ts-ignore
                    //(win as any).missing.push(id);
                }
                return aggr;
            },
            []
        );

        primaryParents = _(parentFiles)
            .map((f) => findAndAddPrimaryParents(f, filesByFileId))
            .flatten()
            .uniq()
            .value();

        // add primaryParents member to child file
        (f as SerializableEntity).primaryParents = primaryParents;
    } else {
        // recursive base case: parent (has no parent itself)
        primaryParents = [f.DataFileID];

        // we don't add primaryParents member to the parent file
    }

    return primaryParents;
}

function extractBiospecimensAndDiagnosisAndDemographics(
    data: BaseSerializableEntity[]
) {
    const biospecimenByBiospecimenID: {
        [htanBiospecimenID: string]: BaseSerializableEntity;
    } = {};
    const diagnosisByParticipantID: {
        [htanParticipantID: string]: BaseSerializableEntity;
    } = {};
    const demographicsByParticipantID: {
        [htanParticipantID: string]: BaseSerializableEntity;
    } = {};

    data.forEach((entity) => {
        if (entity.Component === 'Biospecimen') {
            biospecimenByBiospecimenID[entity.BiospecimenID] = entity;
        }
        if (entity.Component === 'Diagnosis') {
            diagnosisByParticipantID[entity.ParticipantID] = entity;
        }
        if (entity.Component === 'Demographics') {
            demographicsByParticipantID[entity.ParticipantID] = entity;
        }
    });

    return {
        biospecimenByBiospecimenID,
        diagnosisByParticipantID,
        demographicsByParticipantID,
    };
}

function getSampleAndPatientData(
    file: BaseSerializableEntity,
    filesByHTANId: { [DataFileID: string]: BaseSerializableEntity },
    biospecimenByBiospecimenID: {
        [htanBiospecimenID: string]: BaseSerializableEntity;
    },
    diagnosisByParticipantID: {
        [htanParticipantID: string]: BaseSerializableEntity;
    },
    demographicsByParticipantID: {
        [htanParticipantID: string]: BaseSerializableEntity;
    }
) {
    const primaryParents =
        file.primaryParents && file.primaryParents.length
            ? file.primaryParents
            : [file.DataFileID];

    for (let p of primaryParents) {
        if (!filesByHTANId[p].ParentBiospecimenID) {
            console.error(
                'Missing ParentBiospecimenID: ',
                filesByHTANId[p]
            );
        }
    }

    let biospecimen = primaryParents
        .map((p) =>
            filesByHTANId[p].ParentBiospecimenID.split(',').map(
                (ParentBiospecimenID) =>
                    biospecimenByBiospecimenID[ParentBiospecimenID] as
                        | Entity
                        | undefined
            )
        )
        .flat()
        .filter((f) => !!f) as BaseSerializableEntity[];
    biospecimen = _.uniqBy(biospecimen, (b) => b.BiospecimenID);

    const diagnosis = _.uniqBy(
        getCaseData(
            biospecimen,
            biospecimenByBiospecimenID,
            diagnosisByParticipantID
        ),
        (d) => d.ParticipantID
    );

    const demographics = _.uniqBy(
        getCaseData(
            biospecimen,
            biospecimenByBiospecimenID,
            demographicsByParticipantID
        ),
        (d) => d.ParticipantID
    );

    return { biospecimen, diagnosis, demographics };
}

function getCaseData(
    biospecimen: BaseSerializableEntity[],
    biospecimenByBiospecimenID: {
        [htanBiospecimenID: string]: BaseSerializableEntity;
    },
    casesByParticipantID: {
        [htanParticipantID: string]: BaseSerializableEntity;
    }
) {
    return biospecimen
        .map((s) => {
            // ParentID can be both participant or biospecimen, so keep
            // going up the tree until participant is found.
            let ParentID = s.ParentID;
            while (ParentID in biospecimenByBiospecimenID) {
                const parentBioSpecimen =
                    biospecimenByBiospecimenID[ParentID];
                ParentID = parentBioSpecimen.ParentID;
            }
            if (!(ParentID in casesByParticipantID)) {
                console.error(
                    `${s.BiospecimenID} does not have a ParentID with diagnosis information`
                );
                return undefined;
            } else {
                return casesByParticipantID[ParentID] as Entity;
            }
        })
        .filter((f) => !!f) as BaseSerializableEntity[];
}

function extractEntitiesFromSynapseData(
    data: SynapseData,
    WPAtlasMap: { [uppercase_htan_id: string]: WPAtlas }
): BaseSerializableEntity[] {
    const schemasByName = _.keyBy(data.schemas, (s) => s.data_schema);
    const entities: BaseSerializableEntity[] = [];

    _.forEach(data.atlases, (atlas: SynapseAtlas) => {
        _.forEach(atlas, (synapseRecords, key) => {
            if (key === 'htan_id' || key === 'htan_name') {
                // skip these
                return;
            }
            const schemaName = synapseRecords.data_schema;
            if (schemaName) {
                const schema = schemasByName[schemaName];

                synapseRecords.record_list.forEach((record) => {
                    const entity: Partial<BaseSerializableEntity> = {};

                    schema.attributes.forEach(
                        (f: SynapseSchema['attributes'][0], i: number) => {
                            entity[
                                f.id.replace(
                                    /^bts:/,
                                    ''
                                ) as keyof BaseSerializableEntity
                            ] = record.values[i];
                        }
                    );

                    entity.atlasid = atlas.htan_id;
                    entity.atlas_name = atlas.htan_name;
                    if (entity.Component) {
                        const parsedAssay = parseRawAssayType(
                            entity.Component,
                            entity.ImagingAssayType
                        );
                        //file.Component = parsed.name;
                        if (parsedAssay.level && parsedAssay.level.length > 1) {
                            entity.level = parsedAssay.level;
                        } else {
                            entity.level = 'Unknown';
                        }
                        entity.assayName = parsedAssay.name;

                        // special case for Other Assay.  These are assays that don't fit
                        // the standard model.  To have a more descriptive name use assay
                        // type field instead
                        if (parsedAssay.name === 'Other Assay') {
                            entity.assayName =
                                entity.AssayType || 'Other Assay';
                            entity.level = 'Other';
                        }
                    } else {
                        entity.level = 'Unknown';
                    }

                    entity.WPAtlas =
                        WPAtlasMap[entity.atlasid.split('_')[0].toUpperCase()];

                    entities.push(entity as BaseSerializableEntity);
                });
            }
        });
    });

    return entities;
}

function parseRawAssayType(componentName: string, imagingAssayType?: string) {
    // It comes in the form bts:CamelCase-NameLevelX (may or may not have that hyphen).
    // We want to take that and spit out { name: "Camel Case-Name", level: "Level X" }
    //  (with the exception that the prefixes Sc and Sn are always treated as lower case)

    // See if there's a Level in it
    const splitByLevel = componentName.split('Level');
    const level = splitByLevel.length > 1 ? `Level ${splitByLevel[1]}` : null;
    const extractedName = splitByLevel[0];

    if (imagingAssayType) {
        // do not parse imaging assay type, use as is
        return { name: imagingAssayType, level };
    }

    if (extractedName) {
        // Convert camel case to space case
        // Source: https://stackoverflow.com/a/15370765
        let name = extractedName.replace(
            /([A-Z])([A-Z])([a-z])|([a-z])([A-Z])/g,
            '$1$4 $2$3$5'
        );

        // special case: sc as prefix
        name = name.replace(/\bSc /g, 'sc');

        // special case: sn as prefix
        name = name.replace(/\bSn /g, 'sn');

        return { name, level };
    }

    // Couldn't parse
    return { name: componentName, level: null };
}

writeProcessedFile();
