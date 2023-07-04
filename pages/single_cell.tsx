import React from 'react';
import { GetStaticProps } from 'next';
import PortalNavbar from '../components/PortalNavbar';
import Footer from '../components/Footer';
import PageWrapper from '../components/PageWrapper';


function SingleCell(props: any) {
    return (
        <>
            <PageWrapper>
                <div className={'single_cell-iframe-wrapper'}>
                    <iframe
                        className={'single-cell-iframe'}
                        src={
                            'https://nsclc-vdj-ucsc-cellbrowser.surge.sh/?ds=nsclc_vdj'
                        }
                    ></iframe>
                </div>
            </PageWrapper>
        </>
    );
}

export default SingleCell;
