# Gray Foundation Data Portal (in development)

This repo contains the source code for the Gray Foundation Data Portal.

This is a [Next.js](https://nextjs.org/) project bootstrapped with [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app)

## For devs/maintainers

### Backend

There is currently no backend; it's a fully static site, i.e. all filtering happens on the frontend. Data comes from [Synapse](https://www.synapse.org/) backend tables. A script generates a JSON file that contains all the data.

### Getting Started

#### Locally

Clone this repo and run the development server:

```bash
npm run dev
# or
yarn dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing any page. The page auto-updates as you edit the file.

#### Codespace

Alternatively, we have set up a devcontainer config, so start a GitHub codespace and do the same thing above. You should be able to preview and develop inside the container, seeing app changes in real time.

![Codespace screenshot](https://github.com/gf-dcc/portal/assets/32753274/3d7ac316-f9e1-4f4a-823a-5a39fd4194aa)

### Essentials

#### Updating data

Whenever the app is run, you should see the unzipped `public/processed_syn_data.json` created from `public/processed_syn_data.json.gz`. Updating data means some extract/transform steps to create a new version of this gzipped archive: export data from Synapse, transform it into the structure needed, then compress to archive format. This is handled by the script in `data/export_syn_data.clj`. Have [babashka](https://babashka.org/) installed and a valid `SYNAPSE_SERVICE_TOKEN` stored in the environment*, then at the root of project do:
`bb data/export_syn_data.clj`.

For windows visual studio code, use Ubuntu WSL then install babashka using

`(curl -s https://raw.githubusercontent.com/babashka/babashka/master/install)`


**Start the dev app to see expected changes.**

The script will generally need to be updated in cases where the backend tables/configuration changes or the data needs to be transformed differently.

*Note: All of this is set up if in Codespace, and authentication will work as long as you are on the org team.

#### Testing, PRs and Deployment

TODO: more automated tests.

Currently, the main "test" is currently building the project in PR previews.
Merges into `develop` or `main` will also be deployed automatically with Next.js.

### Learn More about Next.js

To learn more about Next.js, take a look at the following resources:

-   [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
-   [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.
