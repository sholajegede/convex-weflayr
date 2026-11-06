# Publishing

Releases are built by GitHub Actions from a version tag, so every npm version
matches a tag and carries npm provenance.

## One time

1. Push `main` to `sholajegede/convex-weflayr` on GitHub.
2. On npmjs.com open the package, then Settings, then Trusted Publisher, and choose
   GitHub Actions. Fill in organization or user `sholajegede`, repository
   `convex-weflayr`, workflow filename `release.yml` and environment `npm`. Allow
   `npm publish`.
3. In the GitHub repository, create an environment named `npm`. Add a required
   reviewer if you want a manual approval before each publish.

No npm token is stored anywhere. The workflow proves its identity to npm for each
publish.

## Each release

```sh
npm version patch        # or minor, major, or prerelease --preid alpha
git push --follow-tags
```

`npm version` updates `package.json`, adds a CHANGELOG heading, commits and
tags. The tag starts the **Release** workflow. It checks that the tag matches
`package.json`, runs build, lint, typecheck and tests, then publishes to npm
and opens a GitHub release with generated notes.

A tag with a dash, such as `v0.2.0-alpha.0`, publishes under the `next` tag on
npm and is marked as a prerelease on GitHub. Install it with
`npm install convex-weflayr@next`.

## Check a build by hand

```sh
npm ci
npm run build
npm pack --dry-run   # lists the files that would be published
```

To try the package in another project, run `npm pack`, then
`npm install ./convex-weflayr-<version>.tgz` there, and delete the `.tgz`
after.

## Versioning

- Patch: fixes with no change to the public API or schema.
- Minor: new methods or options, and optional schema fields.
- Major: anything that breaks an app that already installed the component.
  Below 1.0, a minor version may break, and the CHANGELOG says so.
