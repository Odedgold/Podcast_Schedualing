'use client'

import { useState, useEffect, use } from 'react'

type Lang = 'en' | 'he' | 'es'
type FieldType = 'TEXT' | 'NUMBER' | 'SELECT' | 'MULTISELECT'

interface FieldDef {
  id: string
  label: string
  fieldKey: string
  fieldType: FieldType
  options: string[]
  placeholder?: string | null
  isRequired: boolean
  sortOrder: number
}

// ── Geography & timezone data ─────────────────────────────────────────────────

const USA_STATES: { name: string; tz: string }[] = [
  { name: 'Alabama', tz: 'America/Chicago' },
  { name: 'Alaska', tz: 'America/Anchorage' },
  { name: 'Arizona', tz: 'America/Phoenix' },
  { name: 'Arkansas', tz: 'America/Chicago' },
  { name: 'California', tz: 'America/Los_Angeles' },
  { name: 'Colorado', tz: 'America/Denver' },
  { name: 'Connecticut', tz: 'America/New_York' },
  { name: 'Delaware', tz: 'America/New_York' },
  { name: 'Florida', tz: 'America/New_York' },
  { name: 'Georgia', tz: 'America/New_York' },
  { name: 'Hawaii', tz: 'Pacific/Honolulu' },
  { name: 'Idaho', tz: 'America/Denver' },
  { name: 'Illinois', tz: 'America/Chicago' },
  { name: 'Indiana', tz: 'America/Indiana/Indianapolis' },
  { name: 'Iowa', tz: 'America/Chicago' },
  { name: 'Kansas', tz: 'America/Chicago' },
  { name: 'Kentucky', tz: 'America/New_York' },
  { name: 'Louisiana', tz: 'America/Chicago' },
  { name: 'Maine', tz: 'America/New_York' },
  { name: 'Maryland', tz: 'America/New_York' },
  { name: 'Massachusetts', tz: 'America/New_York' },
  { name: 'Michigan', tz: 'America/New_York' },
  { name: 'Minnesota', tz: 'America/Chicago' },
  { name: 'Mississippi', tz: 'America/Chicago' },
  { name: 'Missouri', tz: 'America/Chicago' },
  { name: 'Montana', tz: 'America/Denver' },
  { name: 'Nebraska', tz: 'America/Chicago' },
  { name: 'Nevada', tz: 'America/Los_Angeles' },
  { name: 'New Hampshire', tz: 'America/New_York' },
  { name: 'New Jersey', tz: 'America/New_York' },
  { name: 'New Mexico', tz: 'America/Denver' },
  { name: 'New York', tz: 'America/New_York' },
  { name: 'North Carolina', tz: 'America/New_York' },
  { name: 'North Dakota', tz: 'America/Chicago' },
  { name: 'Ohio', tz: 'America/New_York' },
  { name: 'Oklahoma', tz: 'America/Chicago' },
  { name: 'Oregon', tz: 'America/Los_Angeles' },
  { name: 'Pennsylvania', tz: 'America/New_York' },
  { name: 'Rhode Island', tz: 'America/New_York' },
  { name: 'South Carolina', tz: 'America/New_York' },
  { name: 'South Dakota', tz: 'America/Chicago' },
  { name: 'Tennessee', tz: 'America/Chicago' },
  { name: 'Texas', tz: 'America/Chicago' },
  { name: 'Utah', tz: 'America/Denver' },
  { name: 'Vermont', tz: 'America/New_York' },
  { name: 'Virginia', tz: 'America/New_York' },
  { name: 'Washington', tz: 'America/Los_Angeles' },
  { name: 'West Virginia', tz: 'America/New_York' },
  { name: 'Wisconsin', tz: 'America/Chicago' },
  { name: 'Wyoming', tz: 'America/Denver' },
]

const EUROPE_COUNTRIES: { name: string; tz: string }[] = [
  { name: 'Austria', tz: 'Europe/Vienna' },
  { name: 'Belgium', tz: 'Europe/Brussels' },
  { name: 'Bulgaria', tz: 'Europe/Sofia' },
  { name: 'Croatia', tz: 'Europe/Zagreb' },
  { name: 'Cyprus', tz: 'Asia/Nicosia' },
  { name: 'Czech Republic', tz: 'Europe/Prague' },
  { name: 'Denmark', tz: 'Europe/Copenhagen' },
  { name: 'Estonia', tz: 'Europe/Tallinn' },
  { name: 'Finland', tz: 'Europe/Helsinki' },
  { name: 'France', tz: 'Europe/Paris' },
  { name: 'Germany', tz: 'Europe/Berlin' },
  { name: 'Greece', tz: 'Europe/Athens' },
  { name: 'Hungary', tz: 'Europe/Budapest' },
  { name: 'Ireland', tz: 'Europe/Dublin' },
  { name: 'Italy', tz: 'Europe/Rome' },
  { name: 'Latvia', tz: 'Europe/Riga' },
  { name: 'Lithuania', tz: 'Europe/Vilnius' },
  { name: 'Luxembourg', tz: 'Europe/Luxembourg' },
  { name: 'Malta', tz: 'Europe/Malta' },
  { name: 'Netherlands', tz: 'Europe/Amsterdam' },
  { name: 'Norway', tz: 'Europe/Oslo' },
  { name: 'Poland', tz: 'Europe/Warsaw' },
  { name: 'Portugal', tz: 'Europe/Lisbon' },
  { name: 'Romania', tz: 'Europe/Bucharest' },
  { name: 'Slovakia', tz: 'Europe/Bratislava' },
  { name: 'Slovenia', tz: 'Europe/Ljubljana' },
  { name: 'Spain', tz: 'Europe/Madrid' },
  { name: 'Sweden', tz: 'Europe/Stockholm' },
  { name: 'Switzerland', tz: 'Europe/Zurich' },
  { name: 'Ukraine', tz: 'Europe/Kyiv' },
  { name: 'United Kingdom', tz: 'Europe/London' },
]

// ── Translations ──────────────────────────────────────────────────────────────

const DAY_LABELS: Record<Lang, string[]> = {
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  he: ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'],
  es: ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'],
}

const T: Record<Lang, Record<string, string>> = {
  en: {
    title: 'Registration Form',
    step1: 'Personal Info', step2: 'Questions', step3: 'Availability',
    fullName: 'Full Name', email: 'Email', phone: 'Phone (optional)',
    school: 'School Name', city: 'City',
    countryLabel: 'Country / State',
    regionIsrael: '🇮🇱  Israel',
    regionUSA: '🇺🇸  USA',
    regionEurope: '🇪🇺  Europe',
    selectState: 'Select your state...',
    selectCountry: 'Select your country...',
    tzAutoSet: 'Timezone set automatically based on your location',
    next: 'Next', back: 'Back', submit: 'Submit', submitting: 'Submitting...',
    availTitle: 'Select Your Availability',
    availSubtitle: 'Click the blocks when you could be free (30-minute slots, 6:00–23:00)',
    availTipMore: 'The more slots you mark, the better your chances of being matched! Mark any time you might be available — even if it\'s not your first choice.',
    availTipSchool: 'If your school has a Hebrew or English class where you could work on the podcast, mark that time too — even if it falls during school hours.',
    availTipNoCommitment: 'No commitment yet! Marking a slot doesn\'t mean you must meet every week at that time. Your actual session times will be agreed upon with your partner after the match.',
    slotsSelected: 'slots selected',
    successTitle: 'Thank you!', successMsg: 'Your availability has been submitted successfully.',
    required: 'This field is required', invalidEmail: 'Please enter a valid email',
    noQuestions: 'No additional questions for this program.',
    selectOption: 'Select an option...',
    privacyTitle: 'Privacy Notice',
    privacyText: 'We collect your name, email, school, and availability solely to schedule program sessions. Your data is stored securely, used only for this program, and will be deleted at its conclusion. You have the right to access, correct, or request deletion of your data by contacting the program coordinator.',
    consentLabel: 'I have read the privacy notice and agree to the processing of my personal data for the purposes of this program.',
    consentRequired: 'You must accept the privacy notice to continue.',
  },
  he: {
    title: 'טופס הרשמה',
    step1: 'פרטים אישיים', step2: 'שאלות', step3: 'זמינות',
    fullName: 'שם מלא', email: 'אימייל', phone: 'טלפון (אופציונלי)',
    school: 'שם בית הספר', city: 'עיר',
    countryLabel: 'מדינה / מחוז',
    regionIsrael: '🇮🇱  ישראל',
    regionUSA: '🇺🇸  ארה״ב',
    regionEurope: '🇪🇺  אירופה',
    selectState: 'בחר מדינה (State)...',
    selectCountry: 'בחר מדינה...',
    tzAutoSet: 'אזור הזמן הוגדר אוטומטית לפי המיקום שבחרת',
    next: 'הבא', back: 'חזרה', submit: 'שלח', submitting: 'שולח...',
    availTitle: 'בחר את הזמינות שלך',
    availSubtitle: 'לחץ על המשבצות בהן אתה עשוי להיות פנוי (בלוקים של 30 דקות, 06:00–23:00)',
    availTipMore: 'ככל שתסמן יותר שעות — כך גדלים הסיכויים שנוכל לשבץ אותך! סמן כל זמן שבו אתה יכול להיות זמין, גם אם זה לא הזמן המועדף עליך.',
    availTipSchool: 'אם בבית הספר שלך יש שיעור עברית או אנגלית שבו ניתן לעבוד על הפודקאסט — סמן גם את הזמן הזה, גם אם הוא נמצא בתוך שעות הלימוד.',
    availTipNoCommitment: 'אין כאן עדיין התחייבות! סימון שעה לא אומר שחייבים להיפגש בה כל שבוע. הזמנים הסופיים יתואמו עם השותף שלך אחרי השיבוץ.',
    slotsSelected: 'משבצות נבחרו',
    successTitle: 'תודה!', successMsg: 'הזמינות שלך נשלחה בהצלחה.',
    required: 'שדה זה הוא חובה', invalidEmail: 'נא להזין כתובת אימייל תקינה',
    noQuestions: 'אין שאלות נוספות לתוכנית זו.',
    selectOption: 'בחר אפשרות...',
    privacyTitle: 'הודעת פרטיות',
    privacyText: 'אנו אוספים את שמך, אימייל, בית הספר וזמינות אך ורק לצורך תיאום מפגשי התוכנית. הנתונים שלך מאוחסנים בצורה מאובטחת, ישמשו לתוכנית זו בלבד, ויימחקו בתום הפעילות. יש לך זכות לעיין, לתקן או לבקש מחיקת הנתונים שלך על ידי פנייה לרכז התוכנית.',
    consentLabel: 'קראתי את הודעת הפרטיות ואני מסכים/ה לעיבוד הנתונים האישיים שלי לצורכי תוכנית זו.',
    consentRequired: 'יש לאשר את הודעת הפרטיות כדי להמשיך.',
  },
  es: {
    title: 'Formulario de Registro',
    step1: 'Información Personal', step2: 'Preguntas', step3: 'Disponibilidad',
    fullName: 'Nombre Completo', email: 'Correo Electrónico', phone: 'Teléfono (opcional)',
    school: 'Nombre de la Escuela', city: 'Ciudad',
    countryLabel: 'País / Estado',
    regionIsrael: '🇮🇱  Israel',
    regionUSA: '🇺🇸  EE.UU.',
    regionEurope: '🇪🇺  Europa',
    selectState: 'Selecciona tu estado...',
    selectCountry: 'Selecciona tu país...',
    tzAutoSet: 'Zona horaria configurada automáticamente según tu ubicación',
    next: 'Siguiente', back: 'Atrás', submit: 'Enviar', submitting: 'Enviando...',
    availTitle: 'Selecciona tu Disponibilidad',
    availSubtitle: 'Haz clic en los bloques cuando puedas estar disponible (30 minutos, 6:00–23:00)',
    availTipMore: '¡Cuantos más bloques marques, mayores son tus posibilidades de ser emparejado! Marca todos los momentos en que puedas estar disponible, aunque no sean los ideales.',
    availTipSchool: 'Si en tu escuela tienes una clase de hebreo o inglés donde puedas trabajar en el podcast, ¡márcala también! Incluso si es durante el horario escolar.',
    availTipNoCommitment: '¡Sin compromiso por ahora! Marcar un bloque no significa que debas reunirte todas las semanas a esa hora. Los horarios reales se acordarán con tu compañero/a tras el emparejamiento.',
    slotsSelected: 'bloques seleccionados',
    successTitle: '¡Gracias!', successMsg: 'Tu disponibilidad se ha enviado correctamente.',
    required: 'Este campo es obligatorio', invalidEmail: 'Por favor ingresa un correo válido',
    noQuestions: 'No hay preguntas adicionales para este programa.',
    selectOption: 'Selecciona una opción...',
    privacyTitle: 'Aviso de Privacidad',
    privacyText: 'Recopilamos tu nombre, correo, escuela y disponibilidad únicamente para programar las sesiones del programa. Tus datos se almacenan de forma segura, se usarán solo para este programa y se eliminarán al finalizar. Tienes derecho a acceder, corregir o solicitar la eliminación de tus datos contactando al coordinador del programa.',
    consentLabel: 'He leído el aviso de privacidad y acepto el tratamiento de mis datos personales para los fines de este programa.',
    consentRequired: 'Debes aceptar el aviso de privacidad para continuar.',
  },
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function FormPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [lang, setLang] = useState<Lang>('en')
  const [step, setStep] = useState(1)
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [schoolList, setSchoolList] = useState<string[]>([])
  const [schoolOther, setSchoolOther] = useState(false)
  const [fieldDefs, setFieldDefs] = useState<FieldDef[]>([])
  const [consentGiven, setConsentGiven] = useState(false)
  // Country/region selection: israel | usa | europe
  const [countryRegion, setCountryRegion] = useState<'israel' | 'usa' | 'europe' | null>(null)

  const t = T[lang]
  const isRtl = lang === 'he'

  const [form, setForm] = useState({
    fullName: '', email: '', phone: '',
    schoolName: '', city: '', country: '',
    confirmedTz: '', detectedTz: '',
  })

  const [customValues, setCustomValues] = useState<Record<string, string>>({})
  const [selectedSlots, setSelectedSlots] = useState<Set<string>>(new Set())

  useEffect(() => {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone
    setForm((f) => ({ ...f, detectedTz: detected }))
  }, [])

  useEffect(() => {
    fetch('/api/schools')
      .then(r => r.json())
      .then((data: { name: string }[]) => setSchoolList(data.map(s => s.name)))
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetch('/api/fields')
      .then(r => r.json())
      .then((data: FieldDef[]) => setFieldDefs(data))
      .catch(() => {})
  }, [])

  // ── Country/region selection helpers ───────────────────────────────────────

  function selectIsrael() {
    setCountryRegion('israel')
    setForm(f => ({ ...f, country: 'Israel', confirmedTz: 'Asia/Jerusalem' }))
    setErrors(prev => { const n = { ...prev }; delete n.country; delete n.confirmedTz; return n })
  }

  function selectUSAState(state: { name: string; tz: string }) {
    setForm(f => ({ ...f, country: state.name, confirmedTz: state.tz }))
    setErrors(prev => { const n = { ...prev }; delete n.country; delete n.confirmedTz; return n })
  }

  function selectEuropeCountry(country: { name: string; tz: string }) {
    setForm(f => ({ ...f, country: country.name, confirmedTz: country.tz }))
    setErrors(prev => { const n = { ...prev }; delete n.country; delete n.confirmedTz; return n })
  }

  function switchRegion(region: 'israel' | 'usa' | 'europe') {
    setCountryRegion(region)
    // Clear previous country/tz selection when switching region
    if (region !== countryRegion) {
      setForm(f => ({ ...f, country: '', confirmedTz: '' }))
    }
    if (region === 'israel') selectIsrael()
  }

  // ── Validation ────────────────────────────────────────────────────────────

  function validateStep1() {
    const e: Record<string, string> = {}
    if (!form.fullName.trim()) e.fullName = t.required
    if (!form.email.trim()) e.email = t.required
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = t.invalidEmail
    if (!form.schoolName.trim()) e.schoolName = t.required
    if (!form.city.trim()) e.city = t.required
    if (!form.country.trim()) e.country = t.required
    if (!form.confirmedTz) e.confirmedTz = t.required
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function validateStep2() {
    const e: Record<string, string> = {}
    for (const f of fieldDefs) {
      if (f.isRequired && !customValues[f.fieldKey]?.trim()) e[f.fieldKey] = t.required
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function handleNext() {
    if (step === 1 && validateStep1()) setStep(2)
    else if (step === 2 && validateStep2()) setStep(3)
  }

  function toggleSlot(slotKey: string) {
    setSelectedSlots(prev => {
      const next = new Set(prev)
      next.has(slotKey) ? next.delete(slotKey) : next.add(slotKey)
      return next
    })
  }

  async function handleSubmit() {
    if (!consentGiven) {
      setErrors({ consent: t.consentRequired })
      return
    }
    setSubmitting(true)
    try {
      const availability = Array.from(selectedSlots).map((key) => {
        const [dayStr, timeStr] = key.split('_')
        const h = timeStr.slice(0, 2), m = timeStr.slice(2, 4)
        const startTime = `${h}:${m}`
        const endMins = parseInt(m) + 30
        const endTime = endMins === 60
          ? `${String(parseInt(h) + 1).padStart(2, '0')}:00`
          : `${h}:${String(endMins).padStart(2, '0')}`
        return { dayOfWeek: parseInt(dayStr), startTime, endTime }
      })

      const customFields: Record<string, string> = {}
      for (const fd of fieldDefs) {
        if (customValues[fd.fieldKey] !== undefined) {
          customFields[fd.id] = customValues[fd.fieldKey]
        }
      }

      await fetch('/api/participants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, token, availability, customFields }),
      })
      setSubmitted(true)
    } finally {
      setSubmitting(false)
    }
  }

  function parseLabel(raw: string): string {
    try {
      const parsed = JSON.parse(raw)
      return parsed[lang] ?? parsed.en ?? raw
    } catch {
      return raw
    }
  }

  // ── Dynamic field renderer ────────────────────────────────────────────────

  function renderField(fd: FieldDef) {
    const label = parseLabel(fd.label)
    const val = customValues[fd.fieldKey] ?? ''
    const err = errors[fd.fieldKey]
    const base = `w-full border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${err ? 'border-red-400' : 'border-gray-300'}`
    const set = (v: string) => setCustomValues(prev => ({ ...prev, [fd.fieldKey]: v }))

    if (fd.fieldType === 'SELECT') {
      return (
        <div key={fd.id}>
          <label className="block text-sm font-medium text-gray-700 mb-1">{label}{fd.isRequired ? ' *' : ''}</label>
          <select className={base + ' bg-white'} value={val} onChange={e => set(e.target.value)}>
            <option value="">{t.selectOption}</option>
            {fd.options.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          {err && <p className="text-red-500 text-xs mt-1">{err}</p>}
        </div>
      )
    }

    if (fd.fieldType === 'MULTISELECT') {
      const selected = val ? val.split(',').map(s => s.trim()) : []
      const toggle = (o: string) => {
        const next = selected.includes(o) ? selected.filter(x => x !== o) : [...selected, o]
        set(next.join(', '))
      }
      return (
        <div key={fd.id}>
          <label className="block text-sm font-medium text-gray-700 mb-2">{label}{fd.isRequired ? ' *' : ''}</label>
          <div className="flex flex-wrap gap-2">
            {fd.options.map(o => (
              <button key={o} type="button" onClick={() => toggle(o)}
                className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${selected.includes(o) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'}`}>
                {o}
              </button>
            ))}
          </div>
          {err && <p className="text-red-500 text-xs mt-1">{err}</p>}
        </div>
      )
    }

    if (fd.fieldType === 'NUMBER') {
      return (
        <div key={fd.id}>
          <label className="block text-sm font-medium text-gray-700 mb-1">{label}{fd.isRequired ? ' *' : ''}</label>
          <input type="number" className={base} value={val} placeholder={fd.placeholder ?? ''}
            onChange={e => set(e.target.value)} />
          {err && <p className="text-red-500 text-xs mt-1">{err}</p>}
        </div>
      )
    }

    return (
      <div key={fd.id}>
        <label className="block text-sm font-medium text-gray-700 mb-1">{label}{fd.isRequired ? ' *' : ''}</label>
        <input className={base} value={val} placeholder={fd.placeholder ?? ''}
          onChange={e => set(e.target.value)} />
        {err && <p className="text-red-500 text-xs mt-1">{err}</p>}
      </div>
    )
  }

  // ── Submitted ─────────────────────────────────────────────────────────────

  if (submitted) {
    return (
      <div className={`min-h-screen bg-gray-50 flex items-center justify-center p-4 ${isRtl ? 'rtl' : 'ltr'}`} dir={isRtl ? 'rtl' : 'ltr'}>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 max-w-sm w-full text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">{t.successTitle}</h2>
          <p className="text-gray-500">{t.successMsg}</p>
        </div>
      </div>
    )
  }

  // ── Form ──────────────────────────────────────────────────────────────────

  const regionBtnBase = 'flex-1 py-2.5 rounded-lg text-sm font-medium border transition-colors'
  const regionBtnActive = 'bg-blue-600 text-white border-blue-600'
  const regionBtnInactive = 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'

  return (
    <div className={`min-h-screen bg-gray-50 ${isRtl ? 'rtl' : 'ltr'}`} dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Language switcher */}
        <div className={`flex gap-2 mb-6 ${isRtl ? 'justify-start' : 'justify-end'}`}>
          {(['en', 'he', 'es'] as Lang[]).map((l) => (
            <button key={l} onClick={() => setLang(l)}
              className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${lang === l ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-blue-400'}`}>
              {l === 'en' ? 'English' : l === 'he' ? 'עברית' : 'Español'}
            </button>
          ))}
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          {/* Progress */}
          <div className="bg-gray-50 border-b border-gray-200 px-6 py-4">
            <h1 className="text-lg font-bold text-gray-900 mb-3">{t.title}</h1>
            <div className="flex gap-2 items-center">
              {[1, 2, 3].map((s) => (
                <div key={s} className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${step >= s ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'}`}>{s}</div>
                  <span className={`text-sm ${step >= s ? 'text-blue-600 font-medium' : 'text-gray-400'}`}>
                    {s === 1 ? t.step1 : s === 2 ? t.step2 : t.step3}
                  </span>
                  {s < 3 && <div className="w-8 h-0.5 bg-gray-200 mx-1" />}
                </div>
              ))}
            </div>
          </div>

          <div className="p-6">
            {/* ── Step 1: Personal Info ── */}
            {step === 1 && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t.fullName} *</label>
                  <input className={`w-full border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.fullName ? 'border-red-400' : 'border-gray-300'}`}
                    value={form.fullName} onChange={e => setForm({ ...form, fullName: e.target.value })} />
                  {errors.fullName && <p className="text-red-500 text-xs mt-1">{errors.fullName}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t.email} *</label>
                  <input type="email" className={`w-full border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.email ? 'border-red-400' : 'border-gray-300'}`}
                    value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                  {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t.phone}</label>
                  <input type="tel" className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
                </div>

                {/* School */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t.school} *</label>
                  {schoolList.length > 0 ? (
                    <>
                      <select className={`w-full border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white ${errors.schoolName ? 'border-red-400' : 'border-gray-300'}`}
                        value={schoolOther ? '__other__' : form.schoolName}
                        onChange={e => {
                          if (e.target.value === '__other__') { setSchoolOther(true); setForm({ ...form, schoolName: '' }) }
                          else { setSchoolOther(false); setForm({ ...form, schoolName: e.target.value }) }
                        }}>
                        <option value="">— Select school —</option>
                        {schoolList.map(s => <option key={s} value={s}>{s}</option>)}
                        <option value="__other__">Other...</option>
                      </select>
                      {schoolOther && (
                        <input className={`mt-2 w-full border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.schoolName ? 'border-red-400' : 'border-gray-300'}`}
                          placeholder="Enter school name" value={form.schoolName}
                          onChange={e => setForm({ ...form, schoolName: e.target.value })} />
                      )}
                    </>
                  ) : (
                    <input className={`w-full border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.schoolName ? 'border-red-400' : 'border-gray-300'}`}
                      value={form.schoolName} onChange={e => setForm({ ...form, schoolName: e.target.value })} />
                  )}
                  {errors.schoolName && <p className="text-red-500 text-xs mt-1">{errors.schoolName}</p>}
                </div>

                {/* City */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t.city} *</label>
                  <input className={`w-full border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.city ? 'border-red-400' : 'border-gray-300'}`}
                    value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} />
                  {errors.city && <p className="text-red-500 text-xs mt-1">{errors.city}</p>}
                </div>

                {/* Country / State selector */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t.countryLabel} *</label>
                  {/* Region buttons */}
                  <div className="flex gap-2 mb-3">
                    <button type="button" onClick={() => switchRegion('israel')}
                      className={`${regionBtnBase} ${countryRegion === 'israel' ? regionBtnActive : regionBtnInactive}`}>
                      {t.regionIsrael}
                    </button>
                    <button type="button" onClick={() => switchRegion('usa')}
                      className={`${regionBtnBase} ${countryRegion === 'usa' ? regionBtnActive : regionBtnInactive}`}>
                      {t.regionUSA}
                    </button>
                    <button type="button" onClick={() => switchRegion('europe')}
                      className={`${regionBtnBase} ${countryRegion === 'europe' ? regionBtnActive : regionBtnInactive}`}>
                      {t.regionEurope}
                    </button>
                  </div>

                  {/* USA states */}
                  {countryRegion === 'usa' && (
                    <div className={`border rounded-lg overflow-hidden ${errors.country ? 'border-red-400' : 'border-gray-200'}`}>
                      <div className="max-h-48 overflow-y-auto divide-y divide-gray-100">
                        {USA_STATES.map(s => (
                          <button key={s.name} type="button" onClick={() => selectUSAState(s)}
                            className={`w-full text-left px-4 py-2 text-sm transition-colors ${form.country === s.name ? 'bg-blue-600 text-white' : 'hover:bg-gray-50 text-gray-700'}`}>
                            {s.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Europe countries */}
                  {countryRegion === 'europe' && (
                    <div className={`border rounded-lg overflow-hidden ${errors.country ? 'border-red-400' : 'border-gray-200'}`}>
                      <div className="max-h-48 overflow-y-auto divide-y divide-gray-100">
                        {EUROPE_COUNTRIES.map(c => (
                          <button key={c.name} type="button" onClick={() => selectEuropeCountry(c)}
                            className={`w-full text-left px-4 py-2 text-sm transition-colors ${form.country === c.name ? 'bg-blue-600 text-white' : 'hover:bg-gray-50 text-gray-700'}`}>
                            {c.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Confirmation */}
                  {form.country && form.confirmedTz && (
                    <div className="mt-2 flex items-center gap-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                      <span>✓</span>
                      <span><strong>{form.country}</strong> — {t.tzAutoSet} ({form.confirmedTz})</span>
                    </div>
                  )}
                  {errors.country && <p className="text-red-500 text-xs mt-1">{errors.country}</p>}
                  {errors.confirmedTz && !errors.country && <p className="text-red-500 text-xs mt-1">{errors.confirmedTz}</p>}
                </div>

                <button onClick={handleNext} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg transition-colors">
                  {t.next} →
                </button>
              </div>
            )}

            {/* ── Step 2: Dynamic Questions ── */}
            {step === 2 && (
              <div className="space-y-6">
                {fieldDefs.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-4">{t.noQuestions}</p>
                ) : (
                  fieldDefs.map(fd => renderField(fd))
                )}
                <div className="flex gap-3">
                  <button onClick={() => { setErrors({}); setStep(1) }}
                    className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2.5 rounded-lg transition-colors">
                    ← {t.back}
                  </button>
                  <button onClick={handleNext}
                    className="flex-grow bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg transition-colors">
                    {t.next} →
                  </button>
                </div>
              </div>
            )}

            {/* ── Step 3: Availability ── */}
            {step === 3 && (
              <div>
                <p className="text-sm font-medium text-gray-700 mb-1">{t.availTitle}</p>
                <p className="text-xs text-gray-400 mb-3">{t.availSubtitle}</p>

                {/* Tips */}
                <div className="mb-4 space-y-2">
                  <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-800">
                    <span className="shrink-0 mt-0.5">💡</span>
                    <span>{t.availTipMore}</span>
                  </div>
                  <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
                    <span className="shrink-0 mt-0.5">🏫</span>
                    <span>{t.availTipSchool}</span>
                  </div>
                  <div className="flex items-start gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-xs text-green-800">
                    <span className="shrink-0 mt-0.5">✅</span>
                    <span>{t.availTipNoCommitment}</span>
                  </div>
                </div>

                <p className="text-xs text-blue-600 mb-4">{selectedSlots.size} {t.slotsSelected}</p>
                <div className="overflow-x-auto">
                  <div className="grid grid-cols-8 gap-0.5 min-w-max">
                    <div />
                    {DAY_LABELS[lang].map((d, i) => (
                      <div key={i} className="text-xs font-medium text-gray-600 text-center pb-2">{d}</div>
                    ))}
                    {Array.from({ length: (23 - 6) * 2 + 1 }, (_, idx) => {
                      const totalMins = 6 * 60 + idx * 30
                      const h = Math.floor(totalMins / 60)
                      const m = totalMins % 60
                      const timeLabel = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
                      const timeKey = `${String(h).padStart(2, '0')}${String(m).padStart(2, '0')}`
                      return [
                        <div key={`label-${idx}`} className="text-xs text-gray-400 text-right pr-2 py-1 w-14">{timeLabel}</div>,
                        ...[0, 1, 2, 3, 4, 5, 6].map((day) => {
                          const slotKey = `${day}_${timeKey}`
                          const active = selectedSlots.has(slotKey)
                          return (
                            <button key={slotKey} type="button" onClick={() => toggleSlot(slotKey)}
                              className={`h-7 w-full rounded-sm transition-colors border ${active ? 'bg-blue-500 border-blue-600' : 'bg-gray-50 border-gray-200 hover:bg-blue-100'}`} />
                          )
                        }),
                      ]
                    }).flat()}
                  </div>
                </div>

                {/* Privacy notice + consent */}
                <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50 p-4 text-xs text-gray-600 space-y-3">
                  <p className="font-semibold text-gray-800 text-sm">{t.privacyTitle}</p>
                  <p className="leading-relaxed">{t.privacyText}</p>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={consentGiven}
                      onChange={e => { setConsentGiven(e.target.checked); if (e.target.checked) setErrors(prev => { const n = { ...prev }; delete n.consent; return n }) }}
                      className="mt-0.5 w-4 h-4 accent-blue-600 shrink-0"
                    />
                    <span className={errors.consent ? 'text-red-600' : ''}>{t.consentLabel}</span>
                  </label>
                  {errors.consent && <p className="text-red-500">{errors.consent}</p>}
                </div>

                <div className="flex gap-3 mt-4">
                  <button onClick={() => { setErrors({}); setStep(2) }}
                    className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2.5 rounded-lg transition-colors">
                    ← {t.back}
                  </button>
                  <button onClick={handleSubmit} disabled={submitting}
                    className="flex-grow bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-2.5 rounded-lg transition-colors">
                    {submitting ? t.submitting : t.submit}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
