import fetch from 'node-fetch';
import React from 'react';

import { GetStaticProps } from 'next';
import PortalNavbar from '../components/PortalNavbar';
import Footer from '../components/Footer';
import PageWrapper from '../components/PageWrapper';

function ImageViewer({ query }: any) {
    const url = decodeURIComponent(query.u).replace(/^http:/, 'https:');

    return (
        <PageWrapper>
            <div className={'single_cell-iframe-wrapper'}>
                <iframe className={'single-cell-iframe'} src={url}></iframe>
            </div>
        </PageWrapper>
    );
}

export default ImageViewer;

ImageViewer.getInitialProps = function ({ query }: any) {
    return { query };
};
