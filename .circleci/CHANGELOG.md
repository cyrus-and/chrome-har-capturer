# Changes

## v0.13.101-beta

### Details

The current implementation of this package only includes requests in the HAR that are marked as completed; "completed" is defined as having the Network.loadingFinished event. Some tags are not providing that event, thefore they are dropped when the HAR is being built.

This version allows for including network requests that finished and did not provide the mentioned event by marking them as finished when they received a response body with a status of 200. Instead of just dropping such requests, they are now added to the HAR. 

### Breaking Changes

N/A

### Jira Issues
[WORK-20812] (https://observepoint.atlassian.net/jira/software/c/projects/WORK/boards/203?modal=detail&selectedIssue=WORK-20812&sprint=157)


## vnext
### Details
### Breaking Changes
### Jira Issues