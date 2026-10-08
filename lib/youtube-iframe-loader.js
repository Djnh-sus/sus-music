let apiLoadPromise = null;

const LOAD_TIMEOUT_MS = 15000;

export function loadYouTubeIframeAPI() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Chỉ chạy được ở phía trình duyệt"));
  }

  if (apiLoadPromise) return apiLoadPromise;

  const promise = new Promise((resolve, reject) => {
    if (window.YT && window.YT.Player) {
      resolve(window.YT);
      return;
    }

    const previousCallback = window.onYouTubeIframeAPIReady;
    let timer = null;

    const tag = document.createElement("script");

    const fail = (message) => {
      clearTimeout(timer);
      tag.remove();
      window.onYouTubeIframeAPIReady = previousCallback;
      reject(new Error(message));
    };

    window.onYouTubeIframeAPIReady = () => {
      clearTimeout(timer);
      if (typeof previousCallback === "function") previousCallback();
      resolve(window.YT);
    };

    tag.src = "https://www.youtube.com/iframe_api";
    tag.onerror = () =>
      fail("Không tải được trình phát YouTube (mạng lỗi hoặc bị trình chặn quảng cáo chặn)");
    timer = setTimeout(() => fail("Tải trình phát YouTube quá thời gian chờ"), LOAD_TIMEOUT_MS);
    document.body.appendChild(tag);
  });

  apiLoadPromise = promise;
  promise.catch(() => {
    if (apiLoadPromise === promise) apiLoadPromise = null;
  });
  return promise;
}
