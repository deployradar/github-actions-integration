# Release Checklist

Use this checklist when preparing a GitHub Actions release. Choose one
distribution model before publishing: a public action is available to anyone; an
internal action is available only within the configured GitHub organization or
enterprise.

## Every release

- [ ] Decide the release version and create a release branch or pull request.
- [ ] Update the default `apiUrl` from the development API to the intended
      production endpoint, or explicitly confirm that the release must use the
      development endpoint.
- [ ] Confirm the public README example uses the published action reference:
      `deployradar/github-actions-integration@<version>`.
- [ ] Add and review a repository `LICENSE` file. `package.json` declares MIT,
      but the repository must contain the matching license text before a public
      release.
- [ ] Run `npm test -- --runInBand`, `npm run lint`, and `npm run format:check`.
- [ ] Run `npm run package` and commit the resulting `dist/index.js` change.
- [ ] Review `action.yml`: input descriptions, default endpoint, outputs, Node
      runtime, action name, and branding.
- [ ] Verify the release workflow with `workflow_dispatch`, using
      `secrets.DEPLOYRADAR_API_KEY`.
- [ ] Merge to the default branch, tag the immutable release (for example,
      `v1.0.0`), and create matching GitHub Release notes.
- [ ] Optionally maintain a moving major-version tag such as `v1` for simpler
      consumer upgrades. Document the supported reference strategy.

## Public repository and Marketplace release

- [ ] Confirm that making the source code and action available to anyone is
      intended. A public action cannot be restricted to DeployRadar customers.
- [ ] Change the repository visibility to public.
- [ ] Confirm that `action.yml` is the single action metadata file at the
      repository root and that its action name is unique in GitHub Marketplace.
- [ ] Have the repository owner or organization owner accept the GitHub
      Marketplace Developer Agreement and enable two-factor authentication.
- [ ] Create the GitHub Release, select **Publish this Action to the GitHub
      Marketplace**, choose a primary category, and publish it.
- [ ] Install the released action in a separate test repository using the
      release tag, not `main`.
- [ ] Update the documentation and changelog with the stable usage reference.

Publishing in Marketplace is optional: a public repository action can be
referenced by workflows without a Marketplace listing. Marketplace publication
requires a public repository. See
[Publishing actions in GitHub Marketplace](https://docs.github.com/en/actions/how-tos/create-and-publish-actions/publish-in-github-marketplace).

## Internal-only distribution

- [ ] Do not make the repository public and do not publish it in Marketplace.
- [ ] For a single organization, retain private visibility and set **Settings →
      Actions → General → Access** to **Accessible from repositories in the
      organization**.
- [ ] For use across organizations in a GitHub Enterprise account, use an
      internal repository and grant organization or enterprise access under the
      same Actions settings.
- [ ] Confirm each consuming repository permits organization actions under its
      own Actions policy.
- [ ] Test consumption from a separate allowed private or internal repository.
- [ ] Review the access implication: people with access to consuming workflow
      logs can indirectly inspect action execution details.

Private actions can be shared with private repositories in the same
organization. Internal repositories are the enterprise option for sharing with
internal and private repositories across the enterprise. See
[sharing with an organization](https://docs.github.com/en/actions/how-tos/reuse-automations/share-with-your-organization)
and
[sharing with an enterprise](https://docs.github.com/en/enterprise-cloud@latest/actions/how-tos/reuse-automations/share-with-your-enterprise).

## Post-release

- [ ] Verify the tagged action completes a deployment against the intended API
      environment.
- [ ] Confirm the request contains no secret values in logs or outputs.
- [ ] Monitor initial customer runs and API error rates.
- [ ] Create a follow-up issue to add an API-supported idempotency key; an
      ambiguous network failure can otherwise create a duplicate deployment
      after a retry.
