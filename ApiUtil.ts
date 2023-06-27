import useSWR from 'swr';
import { promises as fs } from 'fs';
import path from 'path';
import _ from 'lodash';
import fetch from 'node-fetch';
import { Atlas } from './lib/helpers';

export function fetcher(url: string) {
    return fetch(url).then((r) => r.json());
}

export async function getContent(tab: string, htaId: string) {
    let overviewURL = `${WORDPRESS_BASE_URL}${htaId}-${tab}`;
    let data = await fetcher(overviewURL);
    let post = _.filter(data, (o) => o.slug === `${htaId}-${tab}`);
    return post[0] ? post[0].content.rendered : '';
}

export function getAtlasContent(postId: number): Atlas {
    let postUrl = `https://humantumoratlas.org/wp-json/wp/v2/atlas/${postId}`;
    let { data } = useSWR(postUrl, fetcher);
    return data as Atlas;
}

// Getting Atlases stored as static content
export async function getAtlasList(): Promise<Atlas[]> {

    const dir = path.join(process.cwd(), '/public');
    const res = (await fs.readFile(dir + `/processed_synapse_data.json`));
    return res as Atlas[];
}

export async function getStaticContent(slugs: string[]) {
    
    const res = { content: { rendered: '' } };
    return res;
}

export const WORDPRESS_BASE_URL = `https://humantumoratlas.wpcomstaging.com/wp-json/wp/v2/pages/?_fields=content,slug,title&cacheBuster=${new Date().getTime()}&slug=`;

