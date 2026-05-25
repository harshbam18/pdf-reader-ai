import { useEffect, useState } from "react";

type Sentence = {
  id: number;
  text: string;
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
  const [speechLocked, setSpeechLocked] = useState(false);
  const [speechRate, setSpeechRate] = useState(1);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);

  useEffect(() => {
    const loadVoices = () => {
      const available = window.speechSynthesis.getVoices();
      setVoices(available);
      setSelectedVoice(available.find((v) => v.lang.startsWith("en")) || available[0] || null);
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }, []);

  const speakSentence = (index: number) => {
    if (!sentences[index]) return;
    if (speechLocked) return;

    setSpeechLocked(true);

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
      setSpeechLocked(false);

      const next = index + 1;
      if (next < sentences.length) {
        speakSentence(next);
      } else {
        setIsSpeaking(false);
      }
    };

    utterance.onerror = () => {
      setSpeechLocked(false);
      setIsSpeaking(false);
    };

    window.speechSynthesis.speak(utterance);
  };

  const play = () => {
    if (speechLocked) return;

    window.speechSynthesis.cancel();
    const startIndex = activeSentence ?? 0;
    speakSentence(startIndex);
  };

  const pause = () => {
    window.speechSynthesis.pause();
    setSpeechLocked(false);
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
    setSpeechLocked(false);
    setIsSpeaking(false);
  };

  useEffect(() => {
    if (!isSpeaking || activeSentence === null) return;

    window.speechSynthesis.cancel();
    setSpeechLocked(false);

    setTimeout(() => {
      speakSentence(activeSentence);
    }, 100);
  }, [speechRate, selectedVoice]);

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
