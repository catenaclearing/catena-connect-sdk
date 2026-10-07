# Security policy

## Reporting a vulnerability

Please report security problems privately through GitHub:
[open a private report](https://github.com/catenaclearing/catena-connect-sdk/security/advisories/new).
Don't open a public issue or pull request for them.

A useful report says which package and version you used, what you did, and
what happened. A minimal reproduction helps more than anything else. We'll
follow up in the report itself, and if there's an advisory to publish, we'll
credit you in it unless you'd rather we didn't.

## What this covers

- [`@catenaclearing/connect-sdk`](https://www.npmjs.com/package/@catenaclearing/connect-sdk)
- [`@catenaclearing/connect-sdk-react`](https://www.npmjs.com/package/@catenaclearing/connect-sdk-react)
- This repository's build and release workflows

These packages embed the Catena connection flow; they don't run it. If you
can't tell whether a problem is in the package or in the flow it opens,
report it here anyway and we'll get it to the right place.

## Fixes

A fix to a package ships as a new release of that package, so the fix is to
upgrade to the latest version. The changelog and the published advisory say
which versions are affected.

A fix to the build or release workflows lands as a change to this repository
and needs nothing from you. If it could have affected something already
published, the advisory says which releases and what to do about them.

## Look-alike packages

Ours are published only under the `@catenaclearing` scope on npm. If you come
across a package that pretends to be one of ours, let us know through the same
private report, as well as reporting it to npm.
