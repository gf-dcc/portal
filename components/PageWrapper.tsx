import * as React from 'react';
import PortalNavbar from './PortalNavbar';
import Footer from './Footer';

const showContentOnly = () => {
    if (typeof window === 'undefined') {
        return false;
    } else {
        const urlParams = new URLSearchParams(window.location.search);
        return (
            urlParams.has('contentOnly')
        );
    }
};

const PageWrapper = (props: any) => {
    return (
        <div id={'pageWrapper'}>
            {showContentOnly() || <PortalNavbar />}
            {props.children}
            {showContentOnly() || <Footer />}
        </div>
    );
};

export default PageWrapper;
