import useSWR from 'swr';
import { promises as fs } from 'fs';
import path from 'path';
import _ from 'lodash';
import fetch from 'node-fetch';
import { Atlas } from './lib/helpers';

export function fetcher(url: string) {
    return fetch(url).then((r) => r.json());
}
