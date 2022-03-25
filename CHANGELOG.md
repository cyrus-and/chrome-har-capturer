# Changes

## v0.13.102

### Details
This version includes network requests to the HAR file that have a valid response time instead of restricting requests with closed connection response header. As there are multiple header types, filtering by header type is not accurate [MDN_Header_Types] (https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers) 

### Bug Fix
* Network requests with 200 response code and connection keep-alive were being dropped from the har. This version addresses this issue.

### Breaking Changes

### Jira Issues
[WORK-21369] (https://observepoint.atlassian.net/browse/WORK-21369)

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