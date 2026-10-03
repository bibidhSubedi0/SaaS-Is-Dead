import { useState, useRef } from 'react';
import { Mic, Square, Play, Pause, Trash2 } from 'lucide-react';
import { useRecorder } from '../hooks/useRecorder';
import type { Attachment } from '../lib/types';

interface AudioRecorderProps {
  audios: Attachment[];
  onChange: (audios: Attachment[]) => void;
}

export default function AudioRecorder({ audios, onChange }: AudioRecorderProps) {
  const { isRecording, duration, startRecording, stopRecording, cancelRecording } = useRecorder();
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const audioRef = useRef<{ [key: number]: HTMLAudioElement }>({});

  const handleRecord = async () => {
    if (isRecording) {
      const result = await stopRecording();
      if (result) onChange([...audios, result]);
    } else {
      await startRecording();
    }
  };

  const handleCancel = () => {
    cancelRecording();
  };

  const togglePlay = (index: number) => {
    const audioData = audios[index].url ?? audios[index].data ?? '';
    if (playingIndex === index) {
      audioRef.current[index]?.pause();
      setPlayingIndex(null);
      return;
    }

    if (audioRef.current[index]) {
      audioRef.current[index].currentTime = 0;
    } else {
      audioRef.current[index] = new Audio(audioData);
      audioRef.current[index].onended = () => setPlayingIndex(null);
    }
    audioRef.current[index].play();
    setPlayingIndex(index);
  };

  const removeAudio = (index: number) => {
    if (audioRef.current[index]) {
      audioRef.current[index].pause();
      delete audioRef.current[index];
    }
    onChange(audios.filter((_, i) => i !== index));
    if (playingIndex === index) setPlayingIndex(null);
  };

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <div className="space-y-2">
      {/* Existing recordings */}
      {audios.map((_audio, i) => (
        <div key={i} className="flex items-center gap-2 bg-[var(--color-bg-secondary)] rounded-lg px-3 py-2">
          <button
            onClick={() => togglePlay(i)}
            className="w-7 h-7 rounded-full bg-[var(--color-accent)] flex items-center justify-center shrink-0"
          >
            {playingIndex === i ? <Pause size={12} className="text-[var(--color-accent-ink)]" /> : <Play size={12} className="text-[var(--color-accent-ink)] ml-0.5" />}
          </button>
          <div className="flex-1 h-1 bg-[var(--color-border)] rounded-full overflow-hidden">
            <div className="h-full bg-[var(--color-accent)] rounded-full" style={{ width: playingIndex === i ? '100%' : '0%' }} />
          </div>
          <button
            onClick={() => removeAudio(i)}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-danger)] transition-colors"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}

      {/* Record button */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleRecord}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
            isRecording
              ? 'bg-[var(--color-danger)] text-white animate-pulse'
              : 'bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]'
          }`}
        >
          {isRecording ? (
            <>
              <Square size={12} />
              Stop · {formatDuration(duration)}
            </>
          ) : (
            <>
              <Mic size={12} />
              Record audio
            </>
          )}
        </button>
        {isRecording && (
          <button
            onClick={handleCancel}
            className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-danger)] transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
