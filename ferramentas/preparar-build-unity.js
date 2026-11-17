// Prepara uma build WebGL da Unity para rodar no GitHub Pages.
//
// Problema: o Pages não envia o cabeçalho "Content-Encoding" que a Unity exige para
// arquivos comprimidos (.gz, .br, .unityweb). Sem ele a build mostra o erro
// "Unable to parse Build/xxx.gz!". Este script descomprime os arquivos e ajusta o
// index.html da build para usar as versões sem compressão.
//
// Uso (na raiz do repositório):
//   node ferramentas/preparar-build-unity.js Bafome Da_Pena_a_Guilhotina Faraoh Fazendeiro Samurai
//
// Dica: na Unity, em Player Settings > Publishing Settings, escolher
// "Compression Format: Disabled" gera a build já sem compressão (não precisa deste script).

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const SUFIXOS = /\.(gz|br|unityweb)$/;
const URLS = /(dataUrl|frameworkUrl|codeUrl):\s*buildUrl\s*\+\s*"\/([^"]+)"/g;
// Evita barras de rolagem quando a build é aberta dentro do iframe do portfólio
const ESTILO_IFRAME = '<style>html, body { overflow: hidden; background: #000; }</style>';
// O GitHub recusa arquivos acima de 100 MB. Se a versão descomprimida passar disso e o
// loader tiver "Decompression Fallback" ativo, a build continua usando o original
// comprimido e o próprio loader descomprime no navegador (lembrar de liberar o arquivo
// no .gitignore).
const LIMITE_GITHUB = 95 * 1048576;

function descomprimir(buf) {
    if (buf[0] === 0x1f && buf[1] === 0x8b) return zlib.gunzipSync(buf);        // gzip
    if (buf.slice(0, 4).toString("latin1") === "\0asm") return buf;             // wasm já sem compressão
    try { return zlib.brotliDecompressSync(buf); } catch (e) { return buf; }    // brotli (ou texto simples)
}

// Loader exportado com "Decompression Fallback" sabe descomprimir sozinho
function temFallback(pasta) {
    const pastaBuild = path.join(pasta, "Build");
    return fs.readdirSync(pastaBuild).some(a => a.endsWith(".loader.js") &&
        fs.readFileSync(path.join(pastaBuild, a), "utf8").includes("hasUnityMarker"));
}

function preparar(pasta) {
    const arquivoHtml = path.join(pasta, "index.html");
    if (!fs.existsSync(arquivoHtml)) {
        console.log(`- ${pasta}: sem index.html, ignorada`);
        return;
    }
    let html = fs.readFileSync(arquivoHtml, "utf8");
    let convertidos = 0;

    html = html.replace(URLS, (trecho, chave, nome) => {
        const novoNome = nome.replace(SUFIXOS, "");
        const destino = path.join(pasta, "Build", novoNome);
        // Se o index.html já aponta para a versão sem compressão, procura um original
        // comprimido mais novo (a Unity pode ter exportado de novo sem refazer o index.html)
        const candidatos = SUFIXOS.test(nome) ? [nome] : [".gz", ".br", ".unityweb"].map(s => nome + s);
        const comprimido = candidatos.find(c => fs.existsSync(path.join(pasta, "Build", c)));
        if (!comprimido) {
            if (!fs.existsSync(destino)) console.log(`  ! ${nome} não encontrado, mantido`);
            return trecho;
        }
        const origem = path.join(pasta, "Build", comprimido);
        if (fs.existsSync(destino) && fs.statSync(destino).mtimeMs >= fs.statSync(origem).mtimeMs) {
            return trecho.replace(nome, novoNome); // já descomprimido e atualizado
        }
        const saida = descomprimir(fs.readFileSync(origem));
        if (saida.length > LIMITE_GITHUB && temFallback(pasta)) {
            console.log(`  ${comprimido}: ${(saida.length / 1048576).toFixed(1)} MB sem compressão, acima do limite do GitHub;` +
                ` mantido comprimido (o loader descomprime). Libere-o no .gitignore.`);
            if (fs.existsSync(destino)) fs.unlinkSync(destino);
            return trecho.replace(nome, comprimido);
        }
        fs.writeFileSync(destino, saida);
        console.log(`  ${comprimido} -> ${novoNome} (${(saida.length / 1048576).toFixed(1)} MB)`);
        convertidos++;
        return trecho.replace(nome, novoNome);
    });

    if (!html.includes("overflow: hidden; background: #000")) {
        html = html.replace("</head>", `    ${ESTILO_IFRAME}\n  </head>`);
    }
    fs.writeFileSync(arquivoHtml, html);
    console.log(`- ${pasta}: ${convertidos} arquivo(s) descomprimido(s)`);
}

const pastas = process.argv.slice(2);
if (pastas.length === 0) {
    console.log("Uso: node ferramentas/preparar-build-unity.js <pasta-da-build> [outra-pasta ...]");
    process.exit(1);
}
pastas.forEach(preparar);
