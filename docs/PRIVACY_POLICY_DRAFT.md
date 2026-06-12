# FacadeProxy privacy policy draft

> This is a draft for legal/project-owner review. Do not publish without approval.

Effective date: TBD

## Overview

FacadeProxy is a local-first browser extension and localhost proxy that applies user-selected browser personas to selected browser JavaScript values and request headers.

## Data collection

FacadeProxy does not collect, transmit, sell, rent, or share user browsing data with any remote service.

## Data stored locally

FacadeProxy may store the following locally on your device:

- persona definitions;
- active session persona ID;
- extension settings;
- optional proxy control token;
- local debug logs when explicitly enabled.

The extension does not use browser cloud sync storage.

## Network communication

FacadeProxy communicates with a local proxy bound to `127.0.0.1` or another loopback address. The extension does not communicate with FacadeProxy-operated servers.

## Debug logging

By default, persistent proxy logging is disabled. When debug mode is enabled, logs are written locally to `~/.facadeproxy/debug.log` or a user-selected path. Logs are rotated and created with owner-only file permissions on Unix systems.

FacadeProxy does not intentionally log request bodies, response bodies, form data, cookies, or browsing history.

## Permissions

FacadeProxy requests browser permissions to configure local proxy routing, apply local request-header rules, store local settings, and inject persona scripts into pages. These permissions are used only to provide the local persona functionality.

## Third parties

FacadeProxy does not integrate third-party analytics, advertising, crash reporting, or telemetry services.

## User control

Users can clear the active persona, disable the extension, remove local settings through browser extension management UI, and delete local proxy configuration files.

## Contact

Security reports: GitHub Security Advisories or security contact TBD.

Support contact: TBD.
