import { useCallback, useEffect, useRef, useState } from "react";
import {
  getSetting,
  saveSetting,
} from "../storage/indexedDb";

type Sentence = {
  id: number;
  text?: string;
};

type UseTTSProps = {
  sentences: Sentence[];
  activeSentence: number | null;
  setActiveSentence: (index: number | null) => void;
};

export function useTTS({
  sentences,
  activeSentence,
  setActiveSentence,
}: UseTTSProps) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const speechLocked = useRef(false);
  const narrationReady = useRef(false);
  const [speechRate, setSpeechRate] = useState(
    Number(localStorage.getItem("speechRate")) || 1
  );
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);
  const selectedVoiceName = useRef<string | null>(
    localStorage.getItem("selectedVoiceName")
  );
  const initialSpeechRate = useRef(speechRate);
  const speakSentenceRef = useRef<(index: number) => void>(() => {});

  useEffect(() => {
    let mounted = true;

    const loadNarrationSettings = async () => {
      const [
        savedVoiceName,
        savedSpeechRate,
      ] = await Promise.all([
        getSetting<string | null>("selectedVoiceName", selectedVoiceName.current),
        getSetting("speechRate", initialSpeechRate.current),
      ]);

      if (!mounted) return;

      selectedVoiceName.current = savedVoiceName;
      setSpeechRate(savedSpeechRate);
      narrationReady.current = true;

      const available = window.speechSynthesis.getVoices();
      const preferredVoice =
        available.find((v) => v.name === savedVoiceName);

      if (preferredVoice) {
        setSelectedVoice(preferredVoice);
      }
    };

    loadNarrationSettings();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const loadVoices = () => {
      const available = window.speechSynthesis.getVoices();
      const preferredVoice =
        available.find((v) => v.name === selectedVoiceName.current);

      setVoices(available);
      setSelectedVoice(
        preferredVoice ||
          available.find((v) => v.lang.startsWith("en")) ||
          available[0] ||
          null
      );
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }, []);

  useEffect(() => {
    if (!narrationReady.current) return;

    saveSetting("speechRate", speechRate);
    localStorage.setItem("speechRate", speechRate.toString());
  }, [speechRate]);

  useEffect(() => {
    if (!narrationReady.current || !selectedVoice) return;

    selectedVoiceName.current = selectedVoice.name;
    saveSetting("selectedVoiceName", selectedVoice.name);
    localStorage.setItem("selectedVoiceName", selectedVoice.name);
  }, [selectedVoice]);

  const speakSentence = useCallback((index: number) => {
    if (!sentences[index]) return;
    if (!sentences[index].text) {
      const next = index + 1;

      if (next < sentences.length) {
        speakSentenceRef.current(next);
      }

      return;
    }
    if (speechLocked.current) return;

    speechLocked.current = true;

    const freshVoices = window.speechSynthesis.getVoices();
    const validVoice =
      freshVoices.find((v) => v.name === selectedVoice?.name) ||
      freshVoices[0] ||
      null;

    const utterance = new SpeechSynthesisUtterance(sentences[index].text);
    utterance.rate = speechRate;

    if (validVoice) {
      utterance.voice = validVoice;
    }

    utterance.onstart = () => {
      setIsSpeaking(true);
      setActiveSentence(index);
    };

    utterance.onend = () => {
      speechLocked.current = false;

      const next = index + 1;
      if (next < sentences.length) {
        speakSentenceRef.current(next);
      } else {
        setIsSpeaking(false);
      }
    };

    utterance.onerror = () => {
      speechLocked.current = false;
      setIsSpeaking(false);
    };

    window.speechSynthesis.speak(utterance);
  }, [selectedVoice?.name, sentences, setActiveSentence, speechRate]);

  useEffect(() => {
    speakSentenceRef.current = speakSentence;
  }, [speakSentence]);

  const play = () => {
    if (speechLocked.current) return;

    window.speechSynthesis.cancel();
    const startIndex = activeSentence ?? 0;
    speakSentence(startIndex);
  };

  const pause = () => {
    window.speechSynthesis.pause();
    speechLocked.current = false;
    setIsSpeaking(false);
  };

  const resume = () => {
    if (activeSentence === null) return;

    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
      setIsSpeaking(true);
    } else {
      speakSentence(activeSentence);
    }
  };

  const stop = () => {
    window.speechSynthesis.cancel();
    speechLocked.current = false;
    setIsSpeaking(false);
  };

  useEffect(() => {
    if (!isSpeaking || activeSentence === null) return;

    window.speechSynthesis.cancel();
    speechLocked.current = false;

    setTimeout(() => {
      speakSentence(activeSentence);
    }, 100);
  }, [activeSentence, isSpeaking, speakSentence, speechRate, selectedVoice]);

  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
    };
  }, []);

  return {
    isSpeaking,
    speechRate,
    setSpeechRate,
    voices,
    selectedVoice,
    setSelectedVoice,
    play,
    pause,
    resume,
    stop,
    speakSentence,
  };
}
