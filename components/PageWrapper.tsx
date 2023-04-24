import * as React from 'react';
import PortalNavbar from './PortalNavbar';
import Footer from './Footer';

const PageWrapper = (props: any) => {
    return (
        <div id={'pageWrapper'}>
            <PortalNavbar />
            {props.children}
            <Footer />
        </div>
    );
};

export default PageWrapper;
