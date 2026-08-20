from pathlib import Path


def replace_once(path: Path, old: str, new: str, label: str) -> None:
    text = path.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one exact anchor, found {count}")
    path.write_text(text.replace(old, new, 1))


router = Path("apps/api/src/router.ts")
replace_once(
    router,
    '''        return rows.map((row) => ({
          id: row.id,
          provider: row.provider,
          label: row.label,
          hasKey: true,
          isDefault: row.isDefault,
        }));''',
    '''        return rows.map((row) => ({
          id: row.id,
          provider: row.provider,
          label: row.label,
          hasKey: Boolean(row.secretId),
          isDefault: row.isDefault,
        }));''',
    "credential list hasKey",
)

settings = Path("apps/web/src/pages/ModelSettingsOverlay.tsx")
replace_once(
    settings,
    '''  const providerCredential = credentials.find((row) => row.provider === provider);''',
    '''  const providerCredential = credentials.find(
    (row) => row.provider === provider && row.hasKey,
  );''',
    "key-backed provider credential",
)
replace_once(
    settings,
    '''              const connected = credentials.some((credential) => credential.provider === row.id);''',
    '''              const connected = credentials.some(
                (credential) => credential.provider === row.id && credential.hasKey,
              );''',
    "provider connected badge",
)

judge = Path("docs/superpowers/reviews/2026-08-20-flowbots-fable-upstream-parity.md")
replace_once(
    judge,
    '''5. **Final acceptance remains evidence-driven.** Canonical CI, full PR diff review, merged-main CI, and fresh macOS/Mnemosyne/mounted-DMG verification are still mandatory after this review.''',
    '''5. **Final acceptance remains evidence-driven.** Canonical CI, full PR diff review, merged-main CI, and fresh macOS/Mnemosyne/mounted-DMG verification are still mandatory after this review.
6. **The final skeptical pass found one verified Task 13 presentation defect and closed it RED→GREEN.** A credentialless Ollama preference row was reported as `hasKey: true`, causing Model Settings to misclassify the local preference as an encrypted credential. The added contract requires keyless Ollama rows to remain `hasKey: false` while encrypted providers remain true; the API now derives that flag from `secretId` and the UI only treats key-backed rows as connected credentials.''',
    "judge final defect note",
)
