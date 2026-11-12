import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { Users, MapPin, Clock3, Info, Search, LoaderCircle, CalendarDays, ArrowLeft, Eye, EyeOff, CircleCheck, Phone, Mail } from 'lucide-react';
import TopNavbar from '../../components/layout/TopNavbar';
import RoommateAreaPicker from '../../components/RoommateAreaPicker';
import api from '../../services/api';
import './RoommateMatching.css';

const navigation = [
  ['1', 'Phòng trọ'], ['3', 'Nhà nguyên căn'], ['2', 'Căn hộ chung cư'],
  ['8', 'Căn hộ mini'], ['12', 'Căn hộ dịch vụ'], ['5', 'Ở ghép'], ['4', 'Mặt bằng'],
  ['pricing', 'Bảng giá dịch vụ'], ['roommates', 'Tìm bạn cùng phòng'],
];
const defaults = {
  schema_version: 2, gender: '', smoking: '', pets: '', cleanliness: 2, shared_meals: 2,
  sleep_start: '23:00', sleep_end: '01:00', wake_start: '06:00', wake_end: '08:00',
  area: null, radius_meters: 3000, move_in: '', lease_months: 6,
};
const labels = { location: 'Địa điểm', budget: 'Tài chính', schedule: 'Giờ giấc', habits: 'Lối sống', duration: 'Thời gian thuê' };

const searchStatuses = [
  { id: 'active', label: 'Đang tìm', icon: Eye, description: 'Hồ sơ xuất hiện trong kết quả tìm bạn của người khác.' },
  { id: 'hidden', label: 'Tạm ẩn', icon: EyeOff, description: 'Hồ sơ được giữ lại và không xuất hiện trong các lần tìm kiếm mới.' },
  { id: 'matched', label: 'Đã tìm được bạn', icon: CircleCheck, description: 'Đã ngừng tìm bạn. Hồ sơ được giữ lại để bạn có thể tìm lại khi cần.' },
];

function MatchContact({ match }) {
  const phone = typeof match.phone_number === 'string' ? match.phone_number.trim() : '';
  const email = typeof match.email === 'string' ? match.email.trim() : '';
  return <section className="rm-contact" aria-label={`Thông tin liên hệ của ${match.full_name || 'người phù hợp'}`}>
    <h4>Thông tin liên hệ</h4>
    <div className="rm-contact-rows">
      <div><Phone size={16} aria-hidden="true" /><span className="rm-contact-label">Số điện thoại</span>
        <span className={phone ? 'rm-contact-value' : 'rm-contact-missing'}>{phone || 'Chưa cập nhật'}</span>
      </div>
      <div><Mail size={16} aria-hidden="true" /><span className="rm-contact-label">Email</span>
        <span className={email ? 'rm-contact-value' : 'rm-contact-missing'}>{email || 'Chưa cập nhật'}</span>
      </div>
    </div>
  </section>;
}

function RuleField({ name, title, subject, value, onChange }) {
  return <fieldset className="rm-rule"><legend>{title} <span aria-label="bắt buộc">*</span></legend>
    {[
      ['allowed_has', title === 'Thú cưng' ? 'Được — Tôi có thú cưng' : `Được — Tôi có ${subject}`],
      ['allowed_none', `Được — Tôi không ${subject}`],
      ['not_allowed', 'Không được'],
    ].map(([id, text]) => <label key={id} className={value === id ? 'selected' : ''}>
      <input required type="radio" name={name} value={id} checked={value === id} onChange={() => onChange(id)} />
      <span>{text}</span>
    </label>)}
  </fieldset>;
}

function TimeRange({ title, prefix, values, onChange }) {
  const overnight = values[`${prefix}_end`] < values[`${prefix}_start`];
  return <div className="rm-time-row"><span>{title}</span><div className="rm-range">
    <input aria-label={`${title} từ`} required type="time" value={values[`${prefix}_start`]} onChange={e => onChange(`${prefix}_start`, e.target.value)} />
    <span>–</span><input aria-label={`${title} đến`} required type="time" value={values[`${prefix}_end`]} onChange={e => onChange(`${prefix}_end`, e.target.value)} />
  </div>{overnight && <small>Hôm sau</small>}</div>;
}

export default function RoommateMatching() {
  const { user } = useSelector(state => state.auth);
  const [values, setValues] = useState(defaults);
  const [budget, setBudget] = useState({ min: 2000000, max: 3000000 });
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [matches, setMatches] = useState(null);
  const [profileStatus, setProfileStatus] = useState(null);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [profileLoadFailed, setProfileLoadFailed] = useState(false);
  const [statusNotice, setStatusNotice] = useState('');
  const currentStatus = searchStatuses.find(item => item.id === profileStatus);
  const change = (key, value) => setValues(previous => ({ ...previous, [key]: value }));

  useEffect(() => {
    let active = true;
    api.get('/roommates/profile').then(({ data }) => {
      if (!active || !data.profile) return;
      const p = data.profile;
      setProfileStatus(p.status);
      const vector = typeof p.lifestyle_vector === 'string' ? JSON.parse(p.lifestyle_vector) : p.lifestyle_vector;
      // Old slider profiles cannot be mapped safely to the new mandatory rules.
      if (vector?.schema_version === 2) setValues({ ...defaults, ...vector });
      setBudget({ min: Number(p.budget_min) || 2000000, max: Number(p.budget_max) || 3000000 });
    }).catch(() => { if (active) { setProfileLoadFailed(true); setError('Không tải được hồ sơ. Vui lòng tải lại trang trước khi lưu thay đổi.'); } })
      .finally(() => { if (active) setLoadingProfile(false); });
    return () => { active = false; };
  }, []);

  const updateSearchStatus = async status => {
    if (statusUpdating || submitting || status === profileStatus) return;
    setStatusUpdating(true);
    setStatusNotice('');
    setError('');
    try {
      const { data } = await api.patch('/roommates/profile/status', { status });
      setProfileStatus(data.status);
      setMatches(null);
      setStatusNotice(data.status === 'active'
        ? 'Đã bật tìm bạn trở lại. Hồ sơ của bạn có thể được gợi ý cho người khác.'
        : data.status === 'matched'
          ? 'Đã ghi nhận bạn tìm được người ở cùng. Hồ sơ sẽ không xuất hiện trong các lần tìm kiếm mới.'
          : 'Đã tạm ẩn hồ sơ khỏi các lần tìm kiếm mới.');
    } catch (err) {
      setError(err.response?.data?.message || 'Không cập nhật được trạng thái. Vui lòng thử lại.');
    } finally { setStatusUpdating(false); }
  };

  const submit = async event => {
    event.preventDefault();
    if (profileLoadFailed || statusUpdating || submitting) return;
    setError('');
    if (!values.area) return setError('Bạn hãy chọn một vị trí trên bản đồ.');
    if (!(Number(budget.min) > 0 && Number(budget.max) > Number(budget.min))) return setError('Ngân sách tối đa phải lớn hơn ngân sách tối thiểu.');
    if (Number(budget.min) % 1000 !== 0 || Number(budget.max) % 1000 !== 0) return setError('Ngân sách phải là bội số của 1.000 đồng.');
    if (values.sleep_start === values.sleep_end || values.wake_start === values.wake_end) return setError('Hai đầu của mỗi khoảng giờ phải khác nhau.');
    setSubmitting(true);
    try {
      const saved = await api.post('/roommates/profile', { budget_min: Number(budget.min), budget_max: Number(budget.max), lifestyle_vector: values });
      setProfileStatus(saved.data.status);
      if (saved.data.status !== 'active') {
        setStatusNotice('Đã lưu thông tin. Hồ sơ vẫn được ẩn cho đến khi bạn chọn Tìm bạn trở lại.');
        return;
      }
      const { data } = await api.get('/roommates/matches');
      setMatches(data);
    } catch (err) { setError(err.response?.data?.message || 'Không thể tìm bạn lúc này. Vui lòng thử lại.'); }
    finally { setSubmitting(false); }
  };

  return <div className="roommate-page">
    <TopNavbar user={user} />
    <nav className="rm-navigation" aria-label="Danh mục phòng">
      <div>{navigation.map(([id, title]) => <Link key={id} aria-current={id === 'roommates' ? 'page' : undefined}
        to={id === 'roommates' ? '/tenant/roommates' : id === 'pricing' ? '/services-price' : `/tenant/discover?category=${id}`}>{title}</Link>)}</div>
    </nav>
    <main className="rm-main">
      <div className="rm-heading"><div><h1>Tìm bạn cùng phòng</h1><p>Tìm người hợp lối sống, cùng khu vực bạn muốn ở.</p></div>
        <span className="rm-badge"><Users size={16} /> Chỉ ghép người cùng giới tính</span></div>
      {!loadingProfile && !profileLoadFailed && <section className="rm-status-panel" aria-labelledby="rm-status-title">
        <div className="rm-status-heading"><div><h2 id="rm-status-title">Trạng thái tìm bạn</h2>
          <p>{currentStatus?.description || 'Bạn chưa đăng hồ sơ. Hoàn thiện thông tin và nhấn tìm bạn để bắt đầu.'}</p></div>
          {profileStatus && <span className={`rm-status-pill rm-status-${profileStatus}`}><span />{currentStatus?.label}</span>}
        </div>
        {profileStatus && <>
          <div className="rm-status-options" role="group" aria-label="Đổi trạng thái tìm bạn">
            {searchStatuses.map(item => {
              const Icon = item.icon;
              return <button type="button" key={item.id} aria-pressed={profileStatus === item.id}
                disabled={statusUpdating || submitting || profileStatus === item.id}
                onClick={() => updateSearchStatus(item.id)}>
                <Icon size={18} /><span>{item.label}</span>
                {profileStatus === item.id && <CircleCheck size={15} className="rm-status-check" />}
              </button>;
            })}
          </div>
          {profileStatus !== 'active' && <div className="rm-status-resume"><span>Thông tin và tiêu chí tìm bạn vẫn được giữ nguyên.</span>
            <button type="button" disabled={statusUpdating || submitting} onClick={() => updateSearchStatus('active')}>
              {statusUpdating ? <LoaderCircle size={16} className="animate-spin" /> : <Search size={16} />} Tìm bạn trở lại
            </button></div>}
        </>}
        <div className="rm-status-feedback" role="status" aria-live="polite">{statusUpdating ? 'Đang cập nhật trạng thái…' : statusNotice}</div>
      </section>}
      {error && <div className="rm-error rm-page-error" role="alert">{error}</div>}
      {loadingProfile ? <div className="rm-loading" role="status"><LoaderCircle className="animate-spin" /> Đang tải hồ sơ…</div> : matches !== null ?
        <section className="rm-results" aria-live="polite">
          <button className="rm-back" onClick={() => setMatches(null)}><ArrowLeft size={17} /> Điều chỉnh tiêu chí</button>
          <h2>{matches.length ? `${matches.length} người phù hợp với bạn` : 'Chưa tìm thấy người phù hợp'}</h2>
          <p>Chỉ hiển thị người cùng giới tính, khớp điều kiện hút thuốc và thú cưng, có khu vực và khoảng ngân sách giao nhau.</p>
          {matches.length === 0 && <div className="rm-empty"><Users size={38} /><h3>Chưa có hồ sơ đáp ứng tiêu chí</h3><p>Bạn có thể điều chỉnh khu vực hoặc ngân sách và tìm lại sau.</p></div>}
          <div className="rm-result-grid">{matches.map(match => <article className="rm-match" key={match.user_id}>
            <div className="rm-match-top"><div className="rm-avatar">{match.full_name?.slice(0, 1) || 'B'}</div><div><h3>{match.full_name}</h3><span>Cùng giới tính · Khớp điều kiện bắt buộc</span></div><strong>{Math.round(match.match_score)}<small>/100</small></strong></div>
            <p className="rm-match-budget">{new Intl.NumberFormat('vi-VN').format(match.budget_min)} – {new Intl.NumberFormat('vi-VN').format(match.budget_max)} đ/người/tháng</p>
            <div className="rm-scores">{Object.entries(match.match_details || {}).map(([key, score]) => labels[key] && <div key={key}><span>{labels[key]}</span><meter min="0" max="100" value={score} /><b>{Math.round(score)}</b></div>)}</div>
            <p className="rm-match-reason">{match.match_reasoning}</p>
            <MatchContact match={match} />
          </article>)}</div>
        </section> :
        <form className="rm-grid" onSubmit={submit}>
          <section className="rm-panel"><h2><Users /> Lối sống & ngân sách</h2>
            <label className="rm-field rm-gender">Giới tính của bạn<select required value={values.gender} onChange={e => change('gender', e.target.value)}>
              <option value="">Chọn giới tính</option><option value="male">Nam</option><option value="female">Nữ</option><option value="other">Khác</option>
            </select><small>Chỉ tìm người có cùng lựa chọn giới tính với bạn.</small></label>
            <div className="rm-rules"><RuleField name="smoking" title="Hút thuốc" subject="hút thuốc" value={values.smoking} onChange={v => change('smoking', v)} />
              <RuleField name="pets" title="Thú cưng" subject="có thú cưng" value={values.pets} onChange={v => change('pets', v)} /></div>
            <div className="rm-info"><Info size={18} /><span>Chỉ gợi ý người đáp ứng cả hai điều kiện.</span></div>
            <div className="rm-two"><label className="rm-field">Mức độ gọn gàng<select value={values.cleanliness} onChange={e => change('cleanliness', Number(e.target.value))}>
              {['Rất gọn gàng', 'Khá gọn gàng', 'Bình thường', 'Khá thoải mái'].map((text, i) => <option value={i + 1} key={text}>{text}</option>)}
            </select></label><label className="rm-field">Ăn uống chung<select value={values.shared_meals} onChange={e => change('shared_meals', Number(e.target.value))}>
              {['Ăn riêng', 'Thỉnh thoảng ăn chung', 'Thường xuyên ăn chung'].map((text, i) => <option value={i + 1} key={text}>{text}</option>)}
            </select></label></div>
            <fieldset className="rm-budget"><legend>Ngân sách mỗi người / tháng (VNĐ)</legend><div className="rm-range">
              <input aria-label="Ngân sách tối thiểu" type="number" min="1000" step="1000" required value={budget.min} onChange={e => setBudget({ ...budget, min: e.target.value })} />
              <span>–</span><input aria-label="Ngân sách tối đa" type="number" min="1000" step="1000" required value={budget.max} onChange={e => setBudget({ ...budget, max: e.target.value })} />
            </div><small>Tiền thuê phòng, chưa bao gồm điện, nước và phí dịch vụ.</small></fieldset>
            <div className="rm-schedule"><h2><Clock3 /> Giờ giấc sinh hoạt</h2><TimeRange title="Giờ ngủ" prefix="sleep" values={values} onChange={change} /><TimeRange title="Giờ dậy" prefix="wake" values={values} onChange={change} /></div>
          </section>
          <div className="rm-right"><section className="rm-panel"><h2><MapPin /> Khu vực muốn ở</h2><p className="rm-description">Chọn một điểm trên bản đồ và bán kính tìm phòng.</p>
            <RoommateAreaPicker area={values.area} radius={values.radius_meters} onChange={area => change('area', area)} />
            <div className="rm-radius"><label htmlFor="rm-radius">Bán kính tìm phòng <strong>{values.radius_meters / 1000} km</strong></label>
              <input id="rm-radius" type="range" min="500" max="10000" step="500" value={values.radius_meters} onChange={e => change('radius_meters', Number(e.target.value))} />
              <div className="rm-radius-options">{[1000, 3000, 5000, 10000].map(r => <button key={r} type="button" aria-pressed={values.radius_meters === r} onClick={() => change('radius_meters', r)}>{r / 1000} km</button>)}</div>
            </div>
            <div className="rm-duration"><h2><CalendarDays /> Thời gian thuê</h2><div className="rm-two"><label className="rm-field">Ngày chuyển vào<input required type="date" value={values.move_in} onChange={e => change('move_in', e.target.value)} /></label>
              <label className="rm-field">Thời hạn thuê<select value={values.lease_months} onChange={e => change('lease_months', Number(e.target.value))}>{[1, 3, 6, 12, 24].map(n => <option value={n} key={n}>{n} tháng</option>)}</select></label></div></div>
          </section>
          <button className="rm-submit" type="submit" disabled={submitting || statusUpdating || profileLoadFailed}>{submitting ? <LoaderCircle className="animate-spin" size={21} /> : <Search size={21} />}{submitting ? 'Đang xử lý…' : profileStatus && profileStatus !== 'active' ? 'Lưu thông tin' : 'Tìm bạn cùng phòng'}</button>
          <p className="rm-footnote">{profileStatus && profileStatus !== 'active'
            ? 'Lưu thông tin không bật lại tìm kiếm. Chọn “Tìm bạn trở lại” khi bạn sẵn sàng.'
            : 'Kết quả được xếp theo độ tương đồng trên thang 100.'}</p>
          </div>
        </form>}
    </main>
  </div>;
}
