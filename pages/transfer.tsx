import React from 'react';
import Container from 'react-bootstrap/Container';
import Row from 'react-bootstrap/Row';
import PreReleaseBanner from '../components/PreReleaseBanner';

import { CmsData } from '../types';

import PageWrapper from '../components/PageWrapper';

const Transfer = () => {
    return (
        <>
            <PreReleaseBanner />
            <PageWrapper>
                <Container>
                    <Row className={'contentWrapper'}>
                        <h1>Data Transfer</h1>
                        <p>
                            We currently only accept data submissions of atlas
                            teams that are part of Gray Foundation. If you would like to
                            submit data, please see the Gray Foundation docs.
                        </p>
                    </Row>
                </Container>
            </PageWrapper>
        </>
    );
};

export default Transfer;