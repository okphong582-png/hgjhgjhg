const welcome = document.querySelector("#welcome");
const loading = document.querySelector("#loading");
const loadingContent = document.querySelector(".loading-content");
const site = document.querySelector("#site");
const title = document.querySelector("#site-title");
const enter = document.querySelector("#enter");
const music = document.querySelector("#background-music");
const sound = document.querySelector("#sound");

function updateSound() {
  const playing = !music.paused && !music.ended;
  sound.setAttribute("aria-pressed", String(playing));
  sound.setAttribute("aria-label", playing ? "Tắt nhạc nền" : "Bật nhạc nền");
}

function startMusic() {
  music.play().catch(updateSound);
}

function showSite() {
  loading.hidden = true;
  site.hidden = false;
  title.focus({ preventScroll: true });
}

music.volume = 0.5;
music.addEventListener("playing", updateSound);
music.addEventListener("pause", updateSound);
music.addEventListener("error", updateSound);

enter.addEventListener("click", async () => {
  startMusic();
  welcome.hidden = true;
  loading.hidden = false;
  await Promise.allSettled(loadingContent.getAnimations().map((animation) => animation.finished));
  showSite();
}, { once: true });

sound.addEventListener("click", () => {
  if (music.paused) {
    startMusic();
  } else {
    music.pause();
  }
});
