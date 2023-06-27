import React from 'react';
import fs from 'fs';
import process from 'process';
import path from 'path';
import zlib from 'zlib';

import PreReleaseBanner from '../components/PreReleaseBanner';
import HomePage, { IHomePropsProps } from '../components/HomePage';
import { GetStaticProps } from 'next';
import { getContent } from '../ApiUtil';
import PageWrapper from '../components/PageWrapper';
import {
    computeDashboardData,
    Atlas
} from '../lib/helpers';

const Home = (data: IHomePropsProps) => {
    return (
        <>
            <PageWrapper>
                <HomePage {...data} />
            </PageWrapper>
        </>
    );
};

export const getStaticProps: GetStaticProps = async (context) => {

    const cards = await Promise.all([
        getContent('card-1', 'homepage'),
        getContent('card-2', 'homepage'),
        getContent('card-3', 'homepage'),
        getContent('card-4', 'homepage'),
        getContent('card-5', 'homepage'),
        getContent('card-6', 'homepage'),
    ]);

    const processedSynapseData = await zlib
        .gunzipSync(
            await fs.readFileSync(
                path.join(process.cwd(), 'public/processed_syn_data.json.gz')
            )
        )
        .toString();

    const atlases =  (JSON.parse(processedSynapseData)).atlases as Atlas[]

    return {
        props: {
            hero_blurb: "",
            cards: cards,
            atlases,
            synapseCounts: computeDashboardData(atlases),
        },
    };
};

export default Home;
