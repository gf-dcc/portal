import useSWR from 'swr';
import { promises as fs } from 'fs';
import path from 'path';
import _ from 'lodash';
import fetch from 'node-fetch';
import { WPAtlas } from './types';

export function fetcher(url: string) {
    return fetch(url).then((r) => r.json());
}

export async function getContent(tab: string, htaId: string) {
    let overviewURL = `${WORDPRESS_BASE_URL}${htaId}-${tab}`;
    let data = await fetcher(overviewURL);
    let post = _.filter(data, (o) => o.slug === `${htaId}-${tab}`);
    return post[0] ? post[0].content.rendered : '';
}

export function getAtlasContent(postId: number): WPAtlas {
    let postUrl = `https://humantumoratlas.org/wp-json/wp/v2/atlas/${postId}`;
    let { data } = useSWR(postUrl, fetcher);
    return data as WPAtlas;
}

// Getting Atlases stored as static content
export async function getAtlasList(): Promise<WPAtlas[]> {

    const dir = path.join(process.cwd(), '/data');
    const res = await fs.readFile(dir + `/atlases.json`);
    return res.toJSON();
}

export async function getStaticContent(slugs: string[]) {
    
    const res = { content: { rendered: '' } };
    return res;
}

export const WORDPRESS_BASE_URL = `https://humantumoratlas.wpcomstaging.com/wp-json/wp/v2/pages/?_fields=content,slug,title&cacheBuster=${new Date().getTime()}&slug=`;

