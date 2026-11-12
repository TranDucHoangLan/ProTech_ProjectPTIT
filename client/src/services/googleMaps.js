let sdkPromise;

export function loadGoogleMaps(key) {
  if (window.google?.maps?.Map) return Promise.resolve(window.google.maps);
  if (!key) return Promise.reject(new Error('Chưa cấu hình Google Maps.'));
  if (!sdkPromise) {
    sdkPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const callbackName = 'proptechRoommateMapReady';
      const cleanup = () => { clearTimeout(timeout); delete window[callbackName]; };
      const fail = () => {
        cleanup();
        script.remove();
        reject(new Error('Không tải được Google Maps. Vui lòng tải lại trang hoặc chọn vị trí sau.'));
      };
      const timeout = setTimeout(fail, 20000);
      window[callbackName] = () => {
        cleanup();
        if (window.google?.maps?.Map) resolve(window.google.maps);
        else reject(new Error('Google Maps chưa sẵn sàng. Vui lòng tải lại trang.'));
      };
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&loading=async&callback=${callbackName}&language=vi&region=VN&v=weekly`;
      script.async = true;
      script.onerror = fail;
      document.head.appendChild(script);
    }).catch(error => { sdkPromise = undefined; throw error; });
  }
  return sdkPromise;
}
