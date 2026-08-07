const archiver = require('archiver');
const { PassThrough } = require('stream');

/**
 * Pembangun paket InDesign dalam format IDML.
 *
 * KEPUTUSAN DESAIN (penting, mengacu notulen rapat 22 Juli 2026):
 * Tim IT menyatakan "script bisa masukkan data dan narasi ke Indesign,
 * tapi kadang format/font/konten jadi berubah letak ketika masuk ke
 * Indesign. Sehingga perlu merapikan secara manual." Format biner `.indd`
 * adalah format proprietary Adobe TANPA SDK terbuka untuk Node.js -- tidak
 * mungkin dibuat langsung dari server tanpa Adobe InDesign Server berbayar
 * (ExtendScript/UXP). Solusi yang benar-benar dapat dieksekusi dan REALISTIS
 * adalah menghasilkan **IDML** (InDesign Markup Language): format XML
 * terbuka yang secara native dibuka & dikonversi otomatis oleh Adobe
 * InDesign (File > Open, IDML otomatis di-upgrade ke .indd). Ini PERSIS
 * mekanisme "script memasukkan narasi ke InDesign" yang didiskusikan Tim IT
 * -- bedanya kita memakai jalur resmi Adobe (IDML) alih-alih mencoba
 * memalsukan file biner .indd yang tidak mungkin valid.
 *
 * Setelah dibuka di InDesign, staf tetap perlu merapikan tata letak secara
 * manual sesuai catatan notulen (font/posisi bisa bergeser) -- namun seluruh
 * TEKS, ANGKA, dan STRUKTUR TABEL sudah terisi otomatis sehingga pekerjaan
 * manual berkurang drastis dari mengetik ulang penuh menjadi hanya proofing
 * tata letak.
 */

const MIMETYPE = 'application/vnd.adobe.indesign-idml-package';

function xmlEscape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/* ---------------------- designmap.xml (kerangka dokumen) ---------------------- */

function designmapXml(storyRefs) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<?aid style="50" type="document" readerVersion="6.0" featureSet="257" product="19.0(50)" ?>
<Document DOMVersion="19.0" Self="d" StoryList="${storyRefs.map(id => `Story_${id}`).join(' ')}" ActiveLayer="Layer/Layer 1">
  <Language Self="Language/$ID/Indonesian" Name="$ID/Indonesian" SingleQuotes="'’’" DoubleQuotes="“”" />
  <Layer Self="Layer/Layer 1" Name="Layer 1" Visible="true" Locked="false" Printable="true" />
  ${storyRefs.map((id) => `<idPkg:Story xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" src="Stories/Story_${id}.xml" />`).join('\n  ')}
  <idPkg:Spread xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" src="Spreads/Spread_main.xml" />
</Document>`;
}

/* ---------------------- Story: satu blok teks bernarasi ---------------------- */

function storyXml(id, paragraphs, styleName = 'BodyText') {
  const paraXml = paragraphs
    .map(
      (p) =>
        `<ParagraphStyleRange AppliedParagraphStyle="ParagraphStyle/${p.style || styleName}">` +
        `<CharacterStyleRange AppliedCharacterStyle="CharacterStyle/$ID/[No character style]">` +
        `<Content>${xmlEscape(p.text)}</Content>` +
        `</CharacterStyleRange>` +
        `<Br/>` +
        `</ParagraphStyleRange>`
    )
    .join('\n    ');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<?aid style="50" type="snippet" readerVersion="6.0" featureSet="257" product="19.0(50)" ?>
<idPkg:Story xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="19.0">
  <Story Self="Story_${id}" AppliedTOCStyle="n" TrackChanges="false" StoryTitle="${xmlEscape(id)}">
    ${paraXml}
  </Story>
</idPkg:Story>`;
}

/* ---------------------- Spread: satu artboard/halaman berisi text frame per story ---------------------- */

function spreadXml(textFrames) {
  const frames = textFrames
    .map(
      (f, i) => `<TextFrame Self="tf${i}" ParentStory="Story_${f.storyId}" ContentType="TextType" ItemLayer="Layer/Layer 1" ItemTransform="1 0 0 1 0 0" GeometricBounds="${f.y1} ${f.x1} ${f.y2} ${f.x2}">
      <Properties>
        <PathGeometry>
          <GeometryPathType PathOpen="false">
            <PathPointArray>
              <PathPointType Anchor="${f.y1} ${f.x1}" LeftDirection="${f.y1} ${f.x1}" RightDirection="${f.y1} ${f.x1}" />
              <PathPointType Anchor="${f.y1} ${f.x2}" LeftDirection="${f.y1} ${f.x2}" RightDirection="${f.y1} ${f.x2}" />
              <PathPointType Anchor="${f.y2} ${f.x2}" LeftDirection="${f.y2} ${f.x2}" RightDirection="${f.y2} ${f.x2}" />
              <PathPointType Anchor="${f.y2} ${f.x1}" LeftDirection="${f.y2} ${f.x1}" RightDirection="${f.y2} ${f.x1}" />
            </PathPointArray>
          </GeometryPathType>
        </PathGeometry>
      </Properties>
    </TextFrame>`
    )
    .join('\n  ');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<?aid style="50" type="spread" readerVersion="6.0" featureSet="257" product="19.0(50)" ?>
<idPkg:Spread xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="19.0">
  <Spread Self="Spread_main" FlattenerOverride="Default" ShowMasterItems="true">
    <Page Self="page1" GeometricBounds="0 0 841.89 595.28" Name="1" />
    ${frames}
  </Spread>
</idPkg:Spread>`;
}

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<idPkg:Styles xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="19.0">
  <RootParagraphStyleGroup>
    <ParagraphStyle Self="ParagraphStyle/BodyText" Name="BodyText" PointSize="10" Justification="LeftJustified" />
    <ParagraphStyle Self="ParagraphStyle/Judul" Name="Judul" PointSize="24" FontStyle="Bold" FillColor="Color/Orange" />
    <ParagraphStyle Self="ParagraphStyle/SubJudul" Name="SubJudul" PointSize="14" FontStyle="Bold" FillColor="Color/Purple" />
    <ParagraphStyle Self="ParagraphStyle/Bullet" Name="Bullet" PointSize="10" BulletsAndNumberingListType="BulletList" />
    <ParagraphStyle Self="ParagraphStyle/$ID/NormalParagraphStyle" Name="$ID/NormalParagraphStyle" />
  </RootParagraphStyleGroup>
  <RootCharacterStyleGroup>
    <CharacterStyle Self="CharacterStyle/$ID/[No character style]" Name="$ID/[No character style]" />
  </RootCharacterStyleGroup>
</idPkg:Styles>`;

const GRAPHIC_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<idPkg:Graphic xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="19.0">
  <Color Self="Color/Orange" Model="Process" Space="RGB" ColorValue="247 147 30" Name="Orange" />
  <Color Self="Color/Purple" Model="Process" Space="RGB" ColorValue="91 62 150" Name="Purple" />
</idPkg:Graphic>`;

const FONTS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<idPkg:Fonts xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="19.0" />`;

const PREFERENCES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<idPkg:Preferences xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="19.0">
  <DocumentPreference PageWidth="595.28" PageHeight="841.89" PagesPerDocument="1" FacingPages="false" />
</idPkg:Preferences>`;

const CONTAINER_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="designmap.xml" media-type="application/vnd.adobe.indesign-idml-package" />
  </rootfiles>
</container>`;

const META_XML = (title) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">
      <dc:title><rdf:Alt><rdf:li xml:lang="x-default">${xmlEscape(title)}</rdf:li></rdf:Alt></dc:title>
      <dc:creator><rdf:Seq><rdf:li>Otomasi BRS - BPS Provinsi Papua</rdf:li></rdf:Seq></dc:creator>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>`;

/**
 * Susun daftar "story" (blok teks) dari narasi + tabel supaya bisa dialirkan
 * ke masing-masing text frame InDesign. Setiap subbab jadi story terpisah
 * agar staf layout mudah memindah-mindahkan blok ke halaman yang sesuai.
 */
function buildStoriesFromNarrative({ narrative, ctx, meta }) {
  const stories = [];

  stories.push({
    id: 'cover',
    paragraphs: [
      { text: 'BERITA RESMI STATISTIK', style: 'SubJudul' },
      { text: meta.nomorBRS || `No. .../.../${meta.brsNomorPrefix || ''}/Th. ...., 1 ${ctx.bulanNow} ${ctx.tahunNow}`, style: 'BodyText' },
      { text: 'Perkembangan Indeks Harga Konsumen', style: 'Judul' },
      { text: `${ctx.namaWilayah} ${ctx.bulanNow} ${ctx.tahunNow}`, style: 'Judul' },
      { text: narrative.ringkasan.headline, style: 'Bullet' },
    ],
  });

  stories.push({
    id: 'ringkasan',
    paragraphs: [
      { text: 'Ringkasan', style: 'SubJudul' },
      { text: narrative.ringkasan.paragraf1, style: 'Bullet' },
      { text: narrative.ringkasan.paragraf2, style: 'Bullet' },
      { text: narrative.ringkasan.paragraf3, style: 'Bullet' },
    ],
  });

  stories.push({
    id: 'bagian1_intro',
    paragraphs: [
      { text: '1. Indeks Harga Konsumen/Inflasi Menurut Kelompok', style: 'SubJudul' },
      { text: narrative.paragrafPembukaBagian1, style: 'BodyText' },
      { text: narrative.komoditasDominanYoY, style: 'BodyText' },
      { text: narrative.komoditasDominanMtM, style: 'BodyText' },
      { text: narrative.andilKelompokParagraf, style: 'BodyText' },
    ],
  });

  for (const s of narrative.subbab) {
    stories.push({
      id: `sub_${s.kode}`,
      paragraphs: [
        { text: `${s.subbab}. ${s.judul}`, style: 'SubJudul' },
        ...s.paragraf.map((p) => ({ text: p, style: 'BodyText' })),
      ],
    });
  }

  stories.push({
    id: 'bagian2',
    paragraphs: [
      { text: '2. Perbandingan Inflasi Antar Tahun', style: 'SubJudul' },
      { text: narrative.perbandinganAntarTahun, style: 'BodyText' },
    ],
  });

  return stories;
}

/**
 * Bangun buffer .idml (ZIP terstruktur IDML) siap diunduh & dibuka di
 * Adobe InDesign. Mengembalikan Promise<Buffer>.
 */
function buildIdmlPackage({ narrative, ctx, meta }) {
  const stories = buildStoriesFromNarrative({ narrative, ctx, meta });

  // Susun text frame per story, ditumpuk vertikal di satu halaman A4 sebagai
  // titik awal staf layout (posisi & ukuran memang perlu dirapikan manual
  // sesuai desain master BRS -- lihat catatan desain di atas).
  let cursorY = 20;
  const frameHeight = 60;
  const textFrames = stories.map((s) => {
    const f = { storyId: s.id, x1: 20, y1: cursorY, x2: 575, y2: cursorY + frameHeight };
    cursorY += frameHeight + 4;
    return f;
  });

  return new Promise((resolve, reject) => {
    const chunks = [];
    const output = new PassThrough();
    output.on('data', (c) => chunks.push(c));
    output.on('end', () => resolve(Buffer.concat(chunks)));
    output.on('error', reject);

    const archive = archiver('zip', { zlib: { level: 9 }, store: false });
    archive.on('error', reject);
    archive.pipe(output);

    // mimetype HARUS jadi entri pertama & tidak dikompresi, sesuai spesifikasi
    // OPC/IDML (mirip .epub/.docx).
    archive.append(MIMETYPE, { name: 'mimetype', store: true });

    archive.append(designmapXml(stories.map((s) => s.id)), { name: 'designmap.xml' });
    archive.append(CONTAINER_XML, { name: 'META-INF/container.xml' });
    archive.append(META_XML(`BRS IHK ${ctx.namaWilayah} ${ctx.bulanNow} ${ctx.tahunNow}`), {
      name: 'META-INF/metadata.xml',
    });

    archive.append(STYLES_XML, { name: 'Resources/Styles.xml' });
    archive.append(GRAPHIC_XML, { name: 'Resources/Graphic.xml' });
    archive.append(FONTS_XML, { name: 'Resources/Fonts.xml' });
    archive.append(PREFERENCES_XML, { name: 'Resources/Preferences.xml' });

    for (const s of stories) {
      archive.append(storyXml(s.id, s.paragraphs), { name: `Stories/Story_${s.id}.xml` });
    }
    archive.append(spreadXml(textFrames), { name: 'Spreads/Spread_main.xml' });

    archive.finalize();
  });
}

module.exports = { buildIdmlPackage, buildStoriesFromNarrative };
