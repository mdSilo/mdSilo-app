---
mode: testing
url: http://localhost:4950/
max_steps: 40
---

# Track an issue

## Open the issue tracker
Click the "Issues" button in the left bar.
Verify "No issues yet." is shown with "0 Open" and "0 Closed".

## Create an issue
Click "New issue".
Type "Update the welcome note" as the Title and "The feature list in [[Welcome]] is out of date" as the description.
Click "Submit new issue".
Verify "Update the welcome note" is listed and the count shows "1 Open".

## Close it
Click "Update the welcome note" to open the issue.
Close the issue.
Go back to the Issues list.
Verify the count shows "0 Open" and "1 Closed".
