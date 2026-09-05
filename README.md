# Audio Equalizer

Audio Equalizer is a Manifest V3 Chrome extension that gives you real-time control over audio and video playback in your browser tabs. Shape sound with a 10-band graphic equalizer, a preamp, and built-in presets.

## Features

- Adjust 31 Hz through 16 kHz with ten vertical EQ bands.
- Use Bass, Treble, Vocal, Loudness, Rock, Pop, or Classical presets.
- Set a preamp level from -20 dB to +20 dB.
- Enable or disable processing without interrupting playback.
- Apply one EQ curve across all open tabs.
- Store settings with Chrome Sync.
- Process audio locally with the Web Audio API. No network requests are made.

## How it works

The content script finds audio and video elements, including media added dynamically, and routes each element through this graph:

`MediaElementAudioSourceNode -> GainNode -> 10 biquad filters -> destination`

The lowest and highest bands use shelf filters; the middle bands use peaking filters. Gain changes are smoothed to avoid clicks while a slider is moving. The extension also checks all frames so media in embedded frames can be handled when Chrome permits content-script injection.

## Install for development

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode**.
3. Click **Load unpacked**.
4. Select the `chrome-audio-equalizer` folder.
5. Refresh tabs that were already playing media before installation.

## Permissions and privacy

The extension requests only the `storage` permission. Audio is processed in the browser and no audio, browsing data, or settings are sent to an external service.

## Limitations

- A media element already connected to another Web Audio graph cannot be connected a second time, so it may not be equalized on that site.
- Chrome autoplay rules may keep a new audio context suspended until you interact with the page.
- Settings are global rather than per-site.
