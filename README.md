<div align="center">

<h1>ARC</h1>

<p><strong>Academic Research Compass</strong></p>

<h3>One sentence about your research. One line through CHI.</h3>

<p>
  <img alt="Status" src="https://img.shields.io/badge/status-technical%20validation-f5a524?style=flat-square">
  <img alt="CHI 2027" src="https://img.shields.io/badge/CHI%202027-Digital%20Experience%20Competition-111827?style=flat-square">
  <img alt="No login" src="https://img.shields.io/badge/privacy-no%20login%20%C2%B7%20on--device-16a34a?style=flat-square">
  <img alt="License" src="https://img.shields.io/badge/code-MIT-2563eb?style=flat-square">
</p>

<p>
  <a href="https://chidigitalexperience.org/">Competition</a>
  &nbsp;·&nbsp;
  <a href="https://chidigitalexperience.org/programme-data/">Programme data</a>
  &nbsp;·&nbsp;
  <a href="docs/">Docs</a>
</p>

</div>

---

ARC is a mobile web companion for CHI attendees. Tell it what you work on, and it turns 2,600+ papers, posters and demos into a day you can actually walk: what to see, who to meet, and how to get there.

<table>
  <tr>
    <td width="33%" valign="top">
      <strong>Paper ↔ Paper</strong><br>
      <sub>Recommendations with reasons quoted from the abstract, plus one bridge paper into a neighbouring field.</sub>
    </td>
    <td width="33%" valign="top">
      <strong>People ↔ Papers</strong><br>
      <sub>Author profiles from the official programme: where they are presenting and when.</sub>
    </td>
    <td width="33%" valign="top">
      <strong>People ↔ People</strong><br>
      <sub>Live captions, question refinement and meetups that turn a talk into a conversation.</sub>
    </td>
  </tr>
</table>

## Principles

- **No account.** Open it and start.
- **On-device by default.** Your interests, plan and history never leave your phone.
- **Official data only.** Built on the CHI programme feed. Nothing invented, every reason cited.
- **Accessible from day one.** Captions, step-free routes, 16 px type, 44 px targets.

## Quick start

```bash
git clone https://github.com/Dongckim/CHI2027-Competition.git
cd CHI2027-Competition
npm ci
npm run data:fetch && npm run data:build
```

## Repository

```
data/        programme feed → validated, normalised build
contracts/   JSON Schemas shared across modules
recsys/      recommendation engine
app/         mobile web app
functions/   stateless serverless functions
docs/        validation reports and decisions
```

## Data & licence

Programme data © ACM CHI, licensed under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/). Derived data in `data/` follows the same licence. Code is released under MIT.

ARC is an independent competition entry and is not affiliated with or endorsed by ACM or CHI.

## Team

Dongchan Kim · Eunbi Cho · Wonjune Lee
