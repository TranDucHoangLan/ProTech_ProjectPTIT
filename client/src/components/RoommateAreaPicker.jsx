import { useEffect, useRef, useState } from 'react';
import { MapPin, Search } from 'lucide-react';
import GooglePlaceSearch from './GooglePlaceSearch';
import { loadGoogleMaps } from '../services/googleMaps';
import { Circle, MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const initialCenter = { lat: 20.9808, lng: 105.7877 };
const pin = L.divIcon({ className: '', html: '<div style="width:22px;height:22px;background:#7045ef;border:4px solid white;border-radius:50%;box-shadow:0 2px 10px #5434b666"></div>', iconSize: [22, 22], iconAnchor: [11, 11] });

function MapEvents({ area, radius, onChange }) {
  useMapEvents({ click: e => onChange({ lat: e.latlng.lat, lng: e.latlng.lng, label: `Vị trí đã chọn: ${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}` }) });
  const map = useMap();
  const lat = area?.lat;
  const lng = area?.lng;
  useEffect(() => {
    if (Number.isFinite(lat) && Number.isFinite(lng)) map.fitBounds(L.latLng(lat, lng).toBounds(radius * 2), { padding: [20, 20], maxZoom: 15 });
  }, [lat, lng, radius, map]);
  return null;
}

function GoogleArea({ area, radius, onChange, apiKey, onStatus }) {
  const container = useRef(null);
  const mapRef = useRef(null);
  const circleRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const statusRef = useRef(onStatus);
  onChangeRef.current = onChange;
  statusRef.current = onStatus;
  const [ready, setReady] = useState(false);
  const startingArea = useRef(area || initialCenter);

  useEffect(() => {
    let cancelled = false;
    let clickListener;
    loadGoogleMaps(apiKey).then(maps => {
      if (cancelled) return;
      const map = new maps.Map(container.current, { center: startingArea.current, zoom: 13, mapTypeControl: false, streetViewControl: false, fullscreenControl: true });
      mapRef.current = map;
      circleRef.current = new maps.Circle({ map, center: startingArea.current, radius: 0, strokeColor: '#7045ef', strokeWeight: 2, fillColor: '#7045ef', fillOpacity: 0.14, clickable: false });
      clickListener = map.addListener('click', e => onChangeRef.current({ lat: e.latLng.lat(), lng: e.latLng.lng(), label: `Vị trí đã chọn: ${e.latLng.lat().toFixed(5)}, ${e.latLng.lng().toFixed(5)}` }));
      setReady(true);
    }).catch(err => statusRef.current(err.message));
    return () => { cancelled = true; clickListener?.remove(); circleRef.current?.setMap(null); };
  }, [apiKey]);

  useEffect(() => {
    if (!ready || !area) return;
    circleRef.current.setCenter(area);
    circleRef.current.setRadius(radius);
    mapRef.current.fitBounds(circleRef.current.getBounds(), 20);
  }, [area, radius, ready]);

  return <div ref={container} aria-label="Google Maps: chọn khu vực tìm phòng" />;
}

export default function RoommateAreaPicker({ area, radius, onChange }) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const requestRef = useRef(0);
  const search = async () => {
    if (!query.trim()) return;
    const id = ++requestRef.current;
    setBusy(true); setStatus('');
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&countrycodes=vn&limit=1&q=${encodeURIComponent(query)}`);
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (id !== requestRef.current) return;
      if (!data.length) return setStatus('Không tìm thấy địa điểm. Bạn có thể nhấn trực tiếp trên bản đồ.');
      onChange({ lat: Number(data[0].lat), lng: Number(data[0].lon), label: data[0].display_name });
    } catch { if (id === requestRef.current) setStatus('Không thể tìm địa chỉ lúc này. Hãy chọn trực tiếp trên bản đồ.'); }
    finally { if (id === requestRef.current) setBusy(false); }
  };
  return <div>
    {apiKey ? <GooglePlaceSearch apiKey={apiKey} area={area} radius={radius} onChange={onChange} /> : <div className="rm-map-search"><input aria-label="Địa chỉ muốn tìm phòng" placeholder="Tìm địa chỉ hoặc chọn trên bản đồ" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); search(); } }} /><button type="button" aria-label="Tìm địa chỉ" disabled={busy} onClick={search}><Search size={19} /></button></div>}
    {status && <p className="rm-map-status" role="status">{status}</p>}
    <div className="rm-map">{apiKey ? <GoogleArea area={area} radius={radius} onChange={onChange} apiKey={apiKey} onStatus={setStatus} /> :
      <MapContainer center={area || initialCenter} zoom={13} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <MapEvents area={area} radius={radius} onChange={onChange} />
        {area && <><Circle center={area} radius={radius} pathOptions={{ color: '#7045ef', weight: 2, fillOpacity: 0.14 }} /><Marker position={area} icon={pin} /></>}
      </MapContainer>}
    </div>
    <div className="rm-map-caption"><MapPin size={16} /><span>{area?.label || 'Nhấn vào bản đồ để chọn tâm khu vực muốn ở.'}</span></div>
    {!apiKey && <p className="rm-map-status" style={{ marginTop: 8, marginBottom: 0 }}>Bản đồ OpenStreetMap</p>}
  </div>;
}
