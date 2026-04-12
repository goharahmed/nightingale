import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DialogMode, useDialog } from "@/hooks/use-dialog";
import { useDialogNav } from "@/hooks/navigation/use-dialog-nav";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { reanalyzeTranscript } from "@/tauri-bridge/analysis";
import { Song } from "@/types/Song";

/** Sentinel value for the "Auto-detect" option. */
const AUTO_DETECT = "__auto__";

/** Confidence threshold below which we show a warning to the user. */
const LOW_CONFIDENCE_THRESHOLD = 0.7;

const LANGUAGES = [
  ["ar", "Arabic"],
  ["bn", "Bengali"],
  ["zh", "Chinese"],
  ["cs", "Czech"],
  ["nl", "Dutch"],
  ["en", "English"],
  ["fil", "Filipino"],
  ["fr", "French"],
  ["de", "German"],
  ["hi", "Hindi"],
  ["hu", "Hungarian"],
  ["id", "Indonesian"],
  ["it", "Italian"],
  ["ja", "Japanese"],
  ["ko", "Korean"],
  ["ms", "Malay"],
  ["fa", "Persian"],
  ["pl", "Polish"],
  ["pt", "Portuguese"],
  ["pa", "Punjabi"],
  ["ro", "Romanian"],
  ["ru", "Russian"],
  ["es", "Spanish"],
  ["sv", "Swedish"],
  ["ta", "Tamil"],
  ["te", "Telugu"],
  ["th", "Thai"],
  ["tr", "Turkish"],
  ["uk", "Ukrainian"],
  ["ur", "Urdu"],
  ["vi", "Vietnamese"],
];

export type LanguageDialogMode =
  | { mode: "language"; song: Song }
  | { mode: "reanalyze-language"; song: Song };

export function isLanguageDialogMode(mode: DialogMode): mode is LanguageDialogMode {
  return (
    mode !== null &&
    typeof mode === "object" &&
    (mode.mode === "language" || mode.mode === "reanalyze-language")
  );
}

export const SelectLanguageDialog = () => {
  const { mode, close } = useDialog();
  const containerRef = useRef<HTMLDivElement>(null);

  const languageDialog = isLanguageDialogMode(mode) ? mode : null;
  const open = languageDialog !== null;
  const isReanalyze = languageDialog?.mode === "reanalyze-language";
  const song = languageDialog?.song;
  const currentLanguage = song?.language;

  const defaultValue = isReanalyze ? AUTO_DETECT : (currentLanguage ?? AUTO_DETECT);
  const [language, setLanguage] = useState(defaultValue);

  const isLowConfidence =
    song?.language_confidence != null && song.language_confidence < LOW_CONFIDENCE_THRESHOLD;

  const { focusedIndex } = useDialogNav({
    open,
    itemCount: 3,
    onBack: close,
    containerRef,
  });

  if (!languageDialog || !song) {
    return null;
  }

  const title = isReanalyze ? "Reanalyze Transcript" : "Select Language";
  const description = isReanalyze
    ? "Choose a language for re-analysis, or use auto-detect."
    : isLowConfidence
      ? `Language was auto-detected as "${currentLanguage?.toUpperCase()}" with low confidence (${Math.round((song.language_confidence ?? 0) * 100)}%). You may want to select the correct language.`
      : undefined;

  const isAutoDetect = language === AUTO_DETECT;
  const unchanged = !isReanalyze && language === currentLanguage;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-sm">
        <div ref={containerRef} className="contents">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && (
              <DialogDescription className={cn(isLowConfidence && "text-yellow-500")}>
                {description}
              </DialogDescription>
            )}
          </DialogHeader>
          <FieldGroup>
            <Field>
              <Label htmlFor="language-select">Language</Label>
              <Select onValueChange={(value) => setLanguage(value)} defaultValue={defaultValue}>
                <SelectTrigger
                  id="language-select"
                  className={cn(
                    "focus-visible:ring-0 focus-visible:border-transparent",
                    focusedIndex === 0 && "ring-2 ring-primary",
                  )}
                >
                  <SelectValue placeholder="Select a language" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Language</SelectLabel>
                    <SelectItem value={AUTO_DETECT}>Auto-detect</SelectItem>
                    {LANGUAGES.map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose asChild>
              <Button
                variant="outline"
                onClick={close}
                className={cn(
                  "focus-visible:ring-0 focus-visible:border-transparent",
                  focusedIndex === 1 && "ring-2 ring-primary",
                )}
              >
                Cancel
              </Button>
            </DialogClose>
            <Button
              disabled={unchanged}
              onClick={() => {
                if (isAutoDetect) {
                  reanalyzeTranscript(song.file_hash);
                } else {
                  reanalyzeTranscript(song.file_hash, language);
                }
                close();
              }}
              className={cn(
                "focus-visible:ring-0 focus-visible:border-transparent",
                focusedIndex === 2 && "ring-2 ring-primary",
              )}
            >
              {isReanalyze ? "Reanalyze" : "Select"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
};
