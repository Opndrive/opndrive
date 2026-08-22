# docs

## 3.1.0

### Patch Changes

- d8cb534: Add the privacy architecture: policy pages, opt out, CSP and a
  storage registry

  Publishes a privacy policy and terms, adds a site footer and docs footer
  links, and offers a working analytics opt out that carries across both
  subdomains on a cookie written only when somebody actually opts out. Analytics
  now mounts through a gate that honours it. A nonce based Content Security
  Policy protects the credentials held in localStorage, and a storage key
  registry generates the policy table so a new key cannot ship undisclosed.
