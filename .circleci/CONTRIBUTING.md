# Contributing

## Getting Started 

### Branching strategy 
The following branch prefixes are recommended : feature, bugfix or hotfix, however the test job in circleci workflow will trigger with any branch

### Start working
1. Crete a new branch off of master
2. Implement your changes
3. Update [CHANGELOG.md](./CHANGELOG.md)
4. Update/increase the version in the package.json
5. Push your changes to remote, this will trigger the test job in the CI workflow
6. Release to stage following the [publishing steps](#publishing-packages-to-non-production-environmentes)
7. Verify that published package provides the expected solution
8. Once changes are verified on staging, and it is ready for prod, release to production following the [publishing steps](#publishing-packages-to-production-environmentes)
9. You've now published release a production package, go take a break!


### Publishing packages to non production environmentes
If you are publishing the package to be tested by its consumer please use the following syntax when tagging: `vx.x.x.pre-release. If needed review, semantic versioning [docs](https://semver.org/)

### Publishing packages to production environmentes

If you are publishing the package to be used by its consumer please use the following syntax when tagging: `vx.x.x. If needed review, semantic versioning [docs](https://semver.org/), notice the lack of "pre-release"

### Publishing packages

After pushing your branch, verify if the circleci job is triggered and executed successfully on your branch.

Then follow these steps to update the tag version: 
```
git tag -a $version -m $version_change_message
git push origin --tag
git tag --list helps verify tag was pushed successfully
```
Verify that the "deploy" job was triggered with your tag version and executed sucessfully on circle ci 
Verify that the tag version is updated in the AWS code artifact

If you have already pushed a version, but want to update recent changes to the same version, you must delete that tag before pushing again 

```git push --delete origin $version && git tag --delete $version ```


