import { useEffect, useId, useRef, useState } from 'react';
import { LoaderCircle, MapPin, Search, X } from 'lucide-react';
import { loadGoogleMaps } from '../services/googleMaps';

function PredictionName({ prediction }) {
  const formatted = prediction.mainText || prediction.text;
  const chars = Array.from(formatted?.text || String(formatted || ''));
  const ranges = formatted?.matches || [];
  let cursor = 0;
  const parts = [];
  for (const range of ranges) {
    if (range.startOffset > cursor) parts.push(chars.slice(cursor, range.startOffset).join(''));
    parts.push(<strong key={`${range.startOffset}-${range.endOffset}`}>{chars.slice(range.startOffset, range.endOffset).join('')}</strong>);
    cursor = range.endOffset;
  }
  parts.push(chars.slice(cursor).join(''));
  return parts;
}

export default function GooglePlaceSearch({ apiKey, area, radius, onChange }) {
  const listId = useId();
  const inputRef = useRef(null);
  const placesRef = useRef(null);
  const tokenRef = useRef(null);
  const revisionRef = useRef(0);
  const selectedTextRef = useRef('');
  const aliveRef = useRef(true);
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [message, setMessage] = useState('');
  const [retry, setRetry] = useState(0);
  const lat = area?.lat;
  const lng = area?.lng;

  useEffect(() => {
    let cancelled = false;
    aliveRef.current = true;
    setReady(false);
    setMessage('');
    loadGoogleMaps(apiKey).then(maps => maps.importLibrary('places')).then(places => {
      if (cancelled) return;
      placesRef.current = places;
      setReady(true);
    }).catch(() => {
      if (!cancelled) setMessage('Không kết nối được gợi ý Google. Vui lòng thử lại hoặc chọn trên bản đồ.');
    });
    return () => { cancelled = true; aliveRef.current = false; ++revisionRef.current; };
  }, [apiKey, retry]);

  useEffect(() => {
    const input = query.trim();
    if (!ready || input.length < 2 || query === selectedTextRef.current) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const revision = revisionRef.current;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const places = placesRef.current;
        if (!tokenRef.current) tokenRef.current = new places.AutocompleteSessionToken();
        const request = { input, includedRegionCodes: ['vn'], language: 'vi', region: 'vn', sessionToken: tokenRef.current };
        if (Number.isFinite(lat) && Number.isFinite(lng)) request.locationBias = { center: { lat, lng }, radius: Math.max(5000, radius) };
        const result = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions(request);
        if (cancelled || revision !== revisionRef.current) return;
        setSuggestions(result.suggestions.map(item => item.placePrediction).filter(Boolean).slice(0, 5));
        setActiveIndex(-1);
        setMessage('');
      } catch {
        if (!cancelled && revision === revisionRef.current) {
          setSuggestions([]);
          setMessage('Không tải được gợi ý. Hãy thử lại hoặc chọn trực tiếp trên bản đồ.');
        }
      } finally {
        if (!cancelled && revision === revisionRef.current) setLoading(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query, ready, lat, lng, radius, retry]);

  const changeQuery = value => {
    ++revisionRef.current;
    selectedTextRef.current = '';
    setQuery(value);
    setSuggestions([]);
    setActiveIndex(-1);
    setSelecting(false);
    setMessage('');
    setOpen(true);
    if (!value.trim()) tokenRef.current = null;
  };

  const select = async prediction => {
    const revision = ++revisionRef.current;
    const text = prediction.text?.text || String(prediction.text || '');
    selectedTextRef.current = text;
    setQuery(text);
    setOpen(false);
    setSuggestions([]);
    setActiveIndex(-1);
    setLoading(false);
    setSelecting(true);
    setMessage('');
    // toPlace preserves the prediction's session token for its first fetchFields.
    tokenRef.current = null;
    try {
      const place = prediction.toPlace();
      await place.fetchFields({ fields: ['displayName', 'formattedAddress', 'location'] });
      if (!aliveRef.current || revision !== revisionRef.current) return;
      const lat = place.location?.lat();
      const lng = place.location?.lng();
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error();
      const label = [...new Set([place.displayName, place.formattedAddress].filter(Boolean))].join(' — ').slice(0, 1000);
      onChange({ lat, lng, label: label || text.slice(0, 1000) });
    } catch {
      if (aliveRef.current && revision === revisionRef.current) setMessage('Không lấy được tọa độ. Vui lòng tìm và chọn lại địa điểm.');
    } finally {
      if (aliveRef.current && revision === revisionRef.current) setSelecting(false);
    }
  };

  const keyboard = event => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      if (suggestions.length) setActiveIndex(previous => event.key === 'ArrowDown'
        ? (previous + 1) % suggestions.length : (previous < 0 ? suggestions.length - 1 : (previous - 1 + suggestions.length) % suggestions.length));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (open && suggestions.length) select(suggestions[activeIndex >= 0 ? activeIndex : 0]);
      else setOpen(true);
    } else if (event.key === 'Escape') { setOpen(false); setActiveIndex(-1); }
  };
  const showDropdown = open && query.trim().length >= 2 && query !== selectedTextRef.current;

  return <div className="rm-google-search" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) { setOpen(false); setActiveIndex(-1); }
  }}>
    <div className={`rm-place-box ${showDropdown ? 'rm-place-box-open' : ''}`}>
      <div className="rm-place-input-row">
        <input ref={inputRef} type="text" role="combobox" aria-label="Tìm địa điểm trên Google Maps" autoComplete="off"
          aria-autocomplete="list" aria-expanded={showDropdown} aria-controls={listId}
          aria-activedescendant={showDropdown && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
          placeholder="Nhập tên địa điểm, trường học hoặc địa chỉ" value={query}
          onChange={event => changeQuery(event.target.value)} onFocus={() => setOpen(true)} onKeyDown={keyboard} />
        {query && <button type="button" className="rm-place-clear" aria-label="Xóa từ khóa địa điểm" onClick={() => { changeQuery(''); inputRef.current?.focus(); }}><X size={17} /></button>}
        <button type="button" className="rm-place-search-button" aria-label="Xem gợi ý địa điểm" onClick={() => { setOpen(true); inputRef.current?.focus(); }}>
          {loading || selecting ? <LoaderCircle size={21} className="animate-spin" /> : <Search size={22} />}
        </button>
      </div>
      {showDropdown && <div className="rm-place-dropdown">
        <div id={listId} role="listbox" aria-label="Gợi ý địa điểm" aria-busy={loading}>
          {suggestions.map((prediction, index) => <button type="button" role="option" tabIndex={-1}
            aria-selected={index === activeIndex} id={`${listId}-${index}`} key={prediction.placeId}
            className="rm-place-option" onMouseDown={event => event.preventDefault()} onMouseEnter={() => setActiveIndex(index)} onClick={() => select(prediction)}>
            <MapPin size={21} aria-hidden="true" /><span><span className="rm-place-name"><PredictionName prediction={prediction} /></span>
              {prediction.secondaryText && <span className="rm-place-address">{prediction.secondaryText.text || String(prediction.secondaryText)}</span>}
            </span>
          </button>)}
        </div>
        {!suggestions.length && <p className="rm-place-empty" role="status">{message || (!ready ? 'Đang kết nối Google…' : loading ? 'Đang tìm địa điểm…' : 'Không có gợi ý. Hãy nhập tên hoặc địa chỉ cụ thể hơn.')}</p>}
      </div>}
    </div>
    <p className="rm-google-search-feedback" role="status" aria-live="polite">{selecting ? 'Đang lấy vị trí đã chọn…' : message || (showDropdown && suggestions.length ? `${suggestions.length} gợi ý. Dùng phím ↑ ↓ và Enter để chọn.` : 'Gõ tên và chọn một địa điểm trong danh sách gợi ý.')}</p>
    {message && <button type="button" className="rm-google-search-retry" onClick={() => { setMessage(''); setRetry(value => value + 1); setOpen(true); }}>Thử lại</button>}
  </div>;
}
