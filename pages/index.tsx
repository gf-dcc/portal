import React from 'react';
import fs from 'fs';
import process from 'process';
import path from 'path';
import zlib from 'zlib';

import PreReleaseBanner from '../components/PreReleaseBanner';
import HomePage, { IHomePropsProps } from '../components/HomePage';
import { GetStaticProps } from 'next';
import PageWrapper from '../components/PageWrapper';
import {
    computeDashboardData,
    AtlasX
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

    const processedSynapseData = await zlib
        .gunzipSync(
            await fs.readFileSync(
                path.join(process.cwd(), 'public/processed_syn_data.json.gz')
            )
        )
        .toString();

    const atlases =  (JSON.parse(processedSynapseData)).atlases as AtlasX[]

    return {
        props: {
            hero_blurb: "",
            atlases,
            synapseCounts: computeDashboardData(atlases),
        },
    };
};

export default Home;
