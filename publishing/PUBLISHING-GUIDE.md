# Publishing SafeClip

Two separate jobs: put the source on GitHub, and submit the packaged extension
to the Chrome Web Store. Do GitHub first, because the store listing needs to
link to your privacy policy and it is easiest to host that in the repo.

---

# Part 1: GitHub

## 1. Decide on the account name first

Once a repo has stars and links pointing at it, renaming is annoying. Pick the
handle before you push.

## 2. Fill in the placeholders

Three files have placeholders you need to replace before pushing:

| File | What to replace |
|---|---|
| `LICENSE` | `YOUR NAME OR HANDLE` on the copyright line |
| `manifest.json` | `YOUR-GITHUB-USERNAME` in `homepage_url` |
| `README.md` | The Chrome Web Store link, once you have one |

On the LICENSE copyright line: a handle is legally fine there. Copyright exists
whether or not you use your legal name, and plenty of projects ship with just a
handle or project name.

## 3. Create the repo

On github.com, click New repository.

- Name: `safeclip`
- Description: `Encrypted clipboard history for Chrome. Local only, no account, no server.`
- Public
- Do not initialize with a README, license, or gitignore, since you already have them

## 4. Push

```bash
cd path/to/safeclip-extension

git init
git add .
git commit -m "SafeClip 1.5.0"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/safeclip.git
git push -u origin main
```

## 5. Set up the repo page

**Topics** (the gear icon next to About): `chrome-extension`, `privacy`,
`encryption`, `clipboard`, `manifest-v3`, `webcrypto`, `javascript`

**About description:** same one line as above. Recruiters and users read this
before they read anything else.

## 6. Cut a release

Tag it so people can download a fixed version rather than whatever `main`
happens to be:

```bash
git tag v1.5.0
git push origin v1.5.0
```

Then on GitHub go to Releases, Draft a new release, pick the `v1.5.0` tag, and
attach the same zip you upload to the store. Release notes can be short.

## 7. Add screenshots to the README

A README with a screenshot at the top gets read. One without gets skipped. Take
the same shots you make for the store listing, put them in `store-assets/`, and
add them near the top of the README:

```markdown
![SafeClip popup](store-assets/screenshot-recent.png)
```

---

# Part 2: Chrome Web Store

## 1. Register a developer account

Go to the Chrome Web Store Developer Dashboard and sign in.

Three things worth knowing before you click:

- **The fee is five dollars, once, ever.** Not per extension and not annual. It
  covers everything you publish on that account.
- **Two step verification is mandatory.** Turn it on in your Google account
  first or you will be blocked at submission.
- **The account email is permanent.** You cannot change it later. Since you are
  planning a series of extensions, make a dedicated Google account for this
  rather than welding your store presence to a personal inbox.

## 2. Answer the trader question carefully

This is the step that catches people out, and given that you are in the EU it
applies to you directly.

Under the EU Digital Services Act, the store makes every developer declare
whether they are a **trader** (acting for purposes relating to a trade,
business, craft or profession) or a **non-trader** (acting outside of it).

Here is the part worth pausing on. **If you declare as a trader, your name,
physical address, email and a phone number get published on your extension's
listing page, visible to anyone.** The phone number is SMS verified. That is a
requirement, not a setting you can turn off afterwards.

That collides directly with publishing under a handle rather than your real
name. Worth thinking through before you pick, because switching from non-trader
to trader later restarts the verification process.

Google is explicit that this is your call to make and they will not make it for
you, and I am not in a position to tell you which one you are either. What I can
tell you is what the determination turns on: whether you are publishing in
connection with your trade or profession. A free extension published purely as a
hobby project points one way. The same extension published as a portfolio piece
to win freelance work is a genuinely harder question, and if real money is
riding on the answer it is worth ten minutes with someone who knows Czech
consumer law rather than a guess.

## 3. Prepare the upload zip

Do not upload your whole repo. The store wants only what the extension actually
runs. Build scripts and store artwork in the package look sloppy to a reviewer
and add surface area for questions.

```bash
cd path/to
zip -r safeclip-upload.zip safeclip-extension \
  -x "*/store-assets/*" \
  -x "*/make_icons.py" \
  -x "*/make_promo.py" \
  -x "*/.git/*" \
  -x "*.DS_Store"
```

Contents should be: `manifest.json`, `background.js`, `content.js`,
`popup.html`, `popup.css`, `popup.js`, `icons/`, plus `README.md`, `LICENSE`
and `PRIVACY.md` if you want them in there. Nothing else.

## 4. Create the listing

In the dashboard click Add new item and upload the zip. Then work through the
tabs.

**Store listing tab.** All the text is written out in `STORE-LISTING.md` next to
this file. You need:

- Name, summary, description: copy from that file
- Category: Productivity
- Language: English (United States)
- Store icon: `icons/icon128.png`
- Screenshots: at least one, **1280x800 or 640x400 exactly**. Wrong dimensions
  get rejected, so check before uploading.
- Small promo tile: `store-assets/promo-small-440x280.png`, already made
- Marquee tile: `store-assets/promo-marquee-1400x560.png`, optional, but you
  cannot be featured without one

**Screenshots to take.** Four good ones, in this order:

1. The Recent tab with a handful of realistic clips in it
2. The Saved tab with two or three folders, one expanded
3. The unlock screen, showing the passphrase prompt
4. Settings, showing the auto lock dropdown and countdown

Use fake content. Anything real in a screenshot is public forever.

To hit 1280x800 exactly, screenshot the popup on a clean background and resize
in any image editor, or drop it onto a 1280x800 canvas with your accent color
behind it. The second approach looks better and is what most polished listings
do. Adding a short caption over each shot is worth the ten minutes.

**Privacy practices tab.** Single purpose, permission justifications and data
disclosures are all written out in `STORE-LISTING.md`. Fill in every permission
box. Blank justifications are one of the most common rejection reasons.

The host permission justification is the one reviewers will actually read, since
matching on all http/https pages is broad. The text in `STORE-LISTING.md`
explains why the breadth is unavoidable and how narrow the actual behaviour is,
which is the argument that matters.

**Distribution tab.** Public, all regions, free.

## 5. Submit

Click Submit for review.

Reviews commonly land in one to three business days, but that is a pattern, not
a promise. New developer accounts and broad host permissions both push it
longer, and queues stretch around holidays. Do not plan a launch post for the
same day you submit.

## 6. If it gets rejected

It happens, and it is usually mechanical rather than fatal. The rejection email
names the specific policy. Read that line, fix exactly that, resubmit. Do not
argue in an appeal unless you are certain the reviewer made a factual error,
since appeals are limited.

For this extension the plausible flags are the broad host permission and the
privacy policy link. Both are already addressed, so a rejection most likely
means something was left blank rather than something being wrong with the code.

---

# After it is live

Add the store link to the README, and add the GitHub link to the store
description if you left the placeholder in.

For a portfolio piece, the thing worth writing up somewhere is not that you
built a clipboard manager. It is the security reasoning: why the passphrase key
and the recent key are separate, why metadata went inside the encrypted
envelope, why the throttle lives in the background script instead of the UI, and
why wrapKey is not a fix for key extractability. That reasoning is what
distinguishes this from the hundreds of other clipboard extensions, and most of
it is already written down in the README.
