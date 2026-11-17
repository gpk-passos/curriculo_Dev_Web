/* =====================================================================
   OUTLAW - motor 3D (WebGL puro, sem bibliotecas)
   O WebGL é a API de 3D que todo navegador moderno tem, usada através do
   elemento <canvas>. Este arquivo é o "pincel 3D" do jogo: o jogo.js só
   diz o que quer ver (malhas, caixas, brilhos e sombras) e o motor cuida
   de mandar tudo para a placa de vídeo do jeito mais rápido possível.

       Malha      um objeto 3D já guardado na placa de vídeo
       Pincel3D   desenha cada quadro: sombras, cena, céu e brilhos

   As ideias principais (cada uma explicada perto do seu código):
     - cada pixel dos desenhos de sprites.js vira um cubinho (voxel); as
       faces escondidas entre dois cubos não são desenhadas e cada canto
       ganha uma sombra de contato (oclusão de ambiente);
     - todas as caixas que mudam a cada quadro (blocos, balas, partículas)
       vão juntas em UMA chamada de desenho ("instancing");
     - os padrões de tijolo, madeira, areia e cacto são calculados no
       shader, sem nenhum arquivo de imagem;
     - durante o jogo nada é criado na memória: tudo é reaproveitado, para
       o coletor de lixo do navegador não travar a animação.
   Este arquivo não usa nada do jogo: ele só recebe ordens do jogo.js.
   ===================================================================== */

// ----- materiais -----
// O número do material vai junto com cada vértice (ou caixa) e o shader de
// fragmentos desenha o padrão na hora, a partir da posição no mundo.
var MATERIAL = { LISO: 0, TIJOLO: 1, CACTO: 2, MADEIRA: 3, AREIA: 4, BRILHO: 5 };

/* ------------------------- Constantes ---------------------------- */

// Cada vértice das malhas tem 13 números:
//   posição (3) + normal e material (4) + cor e oclusão (4) + padrão u, v (2)
var FLOATS_POR_VERTICE = 13;
var BYTES_POR_VERTICE = FLOATS_POR_VERTICE * 4;

// Cada caixa da fila tem 13 números:
//   canto (3) + tamanho (3) + cor (3) + material, giro, recorte mínimo e máximo (4)
var FLOATS_POR_CAIXA = 13;
var FLOATS_POR_BRILHO = 8;      // x, y, z, raio + r, g, b, intensidade
var FLOATS_POR_BOLHA = 4;       // x, z, raio, força

// quantas coisas cabem em um quadro (a memória é separada uma vez só)
var LIMITE_MALHAS = 64;
var LIMITE_CAIXAS = 8192;
var LIMITE_BRILHOS = 1024;
var LIMITE_BOLHAS = 128;

// planos de corte da câmera: perto o bastante para closes, longe o
// bastante para as mesas do horizonte
var PLANO_PERTO = 8;
var PLANO_LONGE = 20000;

// "sem recorte" é só um intervalo enorme
var SEM_RECORTE = 1e7;

// ----- resolução dinâmica (explicada no medeTempo) -----
// degraus da escala: com a placa de vídeo apertada, a imagem é desenhada
// com menos pixels e esticada na tela
var DEGRAUS_DA_ESCALA = [1, 0.9, 0.8, 0.7, 0.6, 0.5];
// quadros por segundo: abaixo de LENTO a escala desce, acima de FOLGA ela
// tenta subir e um degrau que acabou de subir precisa segurar PROVA
var FPS_LENTO = 52;
var FPS_PROVA = 55;
var FPS_FOLGA = 57;
var FPS_SOBRA = 75;                 // folga clara (monitor rápido): sobe sem esperar
var ORCAMENTO_MS = 1000 / 60;       // tempo de um quadro a 60 por segundo
var JANELA_MS = 500;                // cada decisão olha meio segundo de quadros
var PAUSA_MS = 250;                 // intervalo maior que isso é pausa, não lentidão
var ASSENTA_MS = 250;               // quadros ignorados depois de cada troca
var ESPERA_SUBIDA_MS = 3000;        // folga antes de tentar subir (dobra se falhar)
var ESPERA_SUBIDA_MAX_MS = 60000;
var PROVA_MS = 2500;
var SUCESSO_MS = 3000;              // a descida só acaba com 3 s seguidos de jogo rápido
var BLOQUEIO_MS = 20000;            // sem descer depois de uma descida inútil (dobra)
var BLOQUEIO_MAX_MS = 160000;

// Oclusão de ambiente dos voxels: quantos vizinhos encostam no canto
// (0 = canto bem fechado, 3 = canto livre) -> quanto de luz do céu chega.
var NIVEIS_AO = [0.55, 0.7, 0.85, 1.0];

// O mapa de sombra cobre sempre esta caixa do mundo (a rua inteira e as
// casas em volta). Fora dela tudo fica iluminado.
var CAIXA_DA_LUZ = { x0: -300, x1: 1200, y0: -20, y1: 480, z0: -420, z1: 640 };

// As 6 faces de um cubo de lado 1. Para cada face: a normal "n" e dois
// eixos "u" e "v" sobre ela, escolhidos de modo que u x v = n. Assim os
// cantos (0,0) (1,0) (1,1) (0,1) ficam no sentido anti-horário para quem
// olha a face de fora, que é o lado que o WebGL considera "da frente"
// (o lado de trás nem é desenhado: "back-face culling").
var FACES_DO_CUBO = [
    { n: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1] },
    { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
    { n: [0, 1, 0], u: [0, 0, 1], v: [1, 0, 0] },
    { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
    { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
    { n: [0, 0, -1], u: [0, 1, 0], v: [1, 0, 0] }
];

// os 4 cantos de cada face em (a, b): canto = base + a * u + b * v
var CANTOS_DA_FACE = [[0, 0], [1, 0], [1, 1], [0, 1]];

// Os atributos (dados de cada vértice) têm sempre o mesmo número em todos
// os programas. Assim dá para ligar e desligar cada um uma vez só.
var LOCAL_DOS_ATRIBUTOS = {
    aPosicao: 0, aNormal: 1, aCor: 2, aUV: 3,
    iPosicao: 4, iCentro: 4, iBolha: 4,
    iTamanho: 5, iCorBrilho: 5,
    iCor: 6, iParam: 7
};

// quais atributos cada programa usa (um bit para cada número acima)
var ATRIB_MALHA = 1 | 2 | 4 | 8;
var ATRIB_CAIXA = 1 | 2 | 16 | 32 | 64 | 128;
var ATRIB_SOMBRA_MALHA = 1;
var ATRIB_SOMBRA_CAIXA = 1 | 16 | 32 | 128;
var ATRIB_CEU = 1;
var ATRIB_BRILHO = 1 | 16 | 32;
var ATRIB_BOLHA = 1 | 16;

/* ---------------------- Matemática 4 x 4 ------------------------- */

// As matrizes ficam em Float32Array(16), coluna por coluna (o formato que
// o WebGL espera). Cada função escreve numa matriz que já existe, para não
// criar lixo de memória a cada quadro.

// perspectiva: o que está longe fica menor (fovY em radianos)
function matrizPerspectiva(m, fovY, aspecto, perto, longe) {
    var f = 1 / Math.tan(fovY / 2);
    var nf = 1 / (perto - longe);
    m[0] = f / aspecto; m[1] = 0; m[2] = 0; m[3] = 0;
    m[4] = 0; m[5] = f; m[6] = 0; m[7] = 0;
    m[8] = 0; m[9] = 0; m[10] = (longe + perto) * nf; m[11] = -1;
    m[12] = 0; m[13] = 0; m[14] = 2 * longe * perto * nf; m[15] = 0;
    return m;
}

// projeção ortográfica: sem perspectiva (usada pela luz do sol, que vem
// de tão longe que os raios são paralelos)
function matrizOrtografica(m, esquerda, direita, baixo, cima, perto, longe) {
    var lr = 1 / (esquerda - direita);
    var bt = 1 / (baixo - cima);
    var nf = 1 / (perto - longe);
    m[0] = -2 * lr; m[1] = 0; m[2] = 0; m[3] = 0;
    m[4] = 0; m[5] = -2 * bt; m[6] = 0; m[7] = 0;
    m[8] = 0; m[9] = 0; m[10] = 2 * nf; m[11] = 0;
    m[12] = (esquerda + direita) * lr; m[13] = (cima + baixo) * bt; m[14] = (longe + perto) * nf; m[15] = 1;
    return m;
}

// câmera no ponto "olho" olhando para o ponto "alvo", com +Y para cima
// p = [olhoX, olhoY, olhoZ, alvoX, alvoY, alvoZ]. Os números vêm num vetor
// porque passar números quebrados soltos para uma função cria um objeto
// novo para cada um (e isto roda em todo quadro).
function matrizOlhaPara(m, p) {
    var ox = p[0], oy = p[1], oz = p[2];
    // eixo z da câmera: do alvo para o olho
    var zx = ox - p[3], zy = oy - p[4], zz = oz - p[5];
    var t = 1 / Math.sqrt(zx * zx + zy * zy + zz * zz);
    zx *= t; zy *= t; zz *= t;
    // se a câmera olhar quase na vertical, o "para cima" vira o fundo (-Z)
    var cx = 0, cy = 1, cz = 0;
    if (Math.abs(zy) > 0.999) {
        cy = 0;
        cz = -1;
    }
    // eixo x = cima x z
    var xx = cy * zz - cz * zy, xy = cz * zx - cx * zz, xz = cx * zy - cy * zx;
    t = 1 / Math.sqrt(xx * xx + xy * xy + xz * xz);
    xx *= t; xy *= t; xz *= t;
    // eixo y = z x x
    var yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    m[0] = xx; m[1] = yx; m[2] = zx; m[3] = 0;
    m[4] = xy; m[5] = yy; m[6] = zy; m[7] = 0;
    m[8] = xz; m[9] = yz; m[10] = zz; m[11] = 0;
    m[12] = -(xx * ox + xy * oy + xz * oz);
    m[13] = -(yx * ox + yy * oy + yz * oz);
    m[14] = -(zx * ox + zy * oy + zz * oz);
    m[15] = 1;
    return m;
}

// saida = a x b (pode ser a mesma matriz que a ou b)
function matrizMultiplica(saida, a, b) {
    var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
    var a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    var a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
    var a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
    for (var c = 0; c < 16; c += 4) {
        var b0 = b[c], b1 = b[c + 1], b2 = b[c + 2], b3 = b[c + 3];
        saida[c] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
        saida[c + 1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
        saida[c + 2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
        saida[c + 3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    }
    return saida;
}

// ----- voxels -----
// Chave numérica de um voxel (sem texto, que seria bem mais lento):
// cada coordenada vai de -511 a 511 e ocupa 10 bits do número.
function chaveDoVoxel(x, y, z) {
    return ((x + 512) * 1024 + (y + 512)) * 1024 + (z + 512);
}

// Número "sorteado" de 0 a 1 que é sempre o mesmo para o mesmo voxel:
// dá a cada cubinho uma variação de brilho que não pisca entre quadros.
function sorteioDoVoxel(x, y, z) {
    var h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1440670441)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h = h ^ (h >>> 16);
    return (h >>> 0) / 4294967296;
}

// escreve um vértice no formato das malhas e devolve a próxima posição
function escreveVertice(d, k, px, py, pz, nx, ny, nz, material, cor, brilho, ao, u, v) {
    d[k] = px; d[k + 1] = py; d[k + 2] = pz;
    d[k + 3] = nx; d[k + 4] = ny; d[k + 5] = nz; d[k + 6] = material;
    d[k + 7] = cor[0] * brilho; d[k + 8] = cor[1] * brilho; d[k + 9] = cor[2] * brilho; d[k + 10] = ao;
    d[k + 11] = u; d[k + 12] = v;
    return k + FLOATS_POR_VERTICE;
}

/* --------------------------- Shaders ----------------------------- */

// Os shaders são pequenos programas que rodam na placa de vídeo: o "de
// vértices" posiciona cada canto na tela e o "de fragmentos" pinta cada
// pixel. São escritos em GLSL ES 1.00, que funciona igual no WebGL 1 e no
// WebGL 2. Cada linha é um texto, como as matrizes de sprites.js.

// precisão dos números no shader de fragmentos (alta, se a placa tiver)
var GLSL_PRECISAO = [
    "#ifdef GL_FRAGMENT_PRECISION_HIGH",
    "precision highp float;",
    "#else",
    "precision mediump float;",
    "#endif"
].join("\n");

// giro em torno do eixo Y: um giro positivo leva o +X para o -Z
var GLSL_GIRA = [
    "vec3 giraY(vec3 v, float c, float s) {",
    "    return vec3(v.x * c + v.z * s, v.y, v.z * c - v.x * s);",
    "}"
].join("\n");

// Canto de uma caixa no mundo, já girado e recortado em Z. O giro entra só
// como diferença: numa caixa sem giro a diferença é exatamente zero e o
// canto é exatamente x + l, igual ao da caixa vizinha. Se a conta passasse
// pelo centro, o arredondamento abriria frestas finas entre as caixas.
var GLSL_CENA_CANTO = [
    "vec3 cantoDaCaixa(vec3 centro, float c, float s) {",
    "    vec3 canto = iPosicao + aPosicao * iTamanho;",
    "    vec3 r = canto - centro;",
    "    canto += giraY(r, c, s) - r;",
    "    canto.z = clamp(canto.z, iParam.z, iParam.w);",
    "    return canto;",
    "}"
].join("\n");

// parte comum aos dois shaders de vértices da cena (malhas e caixas)
var GLSL_CENA_SAIDA = [
    "uniform mat4 uVP;",
    "varying vec3 vMundo;",
    "varying vec3 vNormal;",
    "varying vec4 vCor;",
    "varying vec3 vPadrao;",
    "#ifdef SOMBRA",
    "uniform mat4 uLuzVP;",
    "uniform float uDeslocaSombra;",
    "varying vec4 vSombra;",
    "#endif",
    "void saida(vec3 mundo, vec3 normal, vec4 cor, vec3 padrao) {",
    "    vMundo = mundo;",
    "    vNormal = normal;",
    "    vCor = cor;",
    "    vPadrao = padrao;",
    "#ifdef SOMBRA",
    // o ponto é empurrado um texel para fora da superfície antes de ir
    // para o mapa de sombra: evita as listras de "acne" sem descolar a sombra
    "    vSombra = uLuzVP * vec4(mundo + normal * uDeslocaSombra, 1.0);",
    "#endif",
    "    gl_Position = uVP * vec4(mundo, 1.0);",
    "}"
].join("\n");

// malhas: posição e giro chegam num vec4 (x, y, z, giro) e o giro é feito
// aqui, na placa de vídeo, sem nenhuma conta de matriz no processador
var GLSL_MALHA_VERTICE = [
    "attribute vec3 aPosicao;",
    "attribute vec4 aNormal;",      // xyz = normal, w = material
    "attribute vec4 aCor;",         // rgb = cor, a = oclusão de ambiente
    "attribute vec2 aUV;",
    "uniform vec4 uTransforma;",
    GLSL_GIRA,
    GLSL_CENA_SAIDA,
    "void main() {",
    "    float c = cos(uTransforma.w);",
    "    float s = sin(uTransforma.w);",
    "    vec3 mundo = giraY(aPosicao, c, s) + uTransforma.xyz;",
    "    saida(mundo, giraY(aNormal.xyz, c, s), aCor, vec3(aUV, aNormal.w));",
    "}"
].join("\n");

// Caixas: um cubo de lado 1 desenhado milhares de vezes de uma vez só.
// Cada cópia ("instância") traz o seu canto, tamanho, cor e parâmetros.
// O recorte em Z prende o z de cada canto dentro do intervalo: numa caixa
// sem giro isso dá exatamente a caixa cortada, ainda fechada.
var GLSL_CAIXA_VERTICE = [
    "attribute vec3 aPosicao;",     // canto do cubo de lado 1 (0 a 1)
    "attribute vec3 aNormal;",
    "attribute vec3 iPosicao;",     // canto mínimo da caixa
    "attribute vec3 iTamanho;",
    "attribute vec3 iCor;",
    "attribute vec4 iParam;",       // material, giro, recorte mínimo, recorte máximo
    GLSL_GIRA,
    GLSL_CENA_CANTO,
    GLSL_CENA_SAIDA,
    "void main() {",
    "    float c = cos(iParam.y);",
    "    float s = sin(iParam.y);",
    "    vec3 centro = iPosicao + iTamanho * 0.5;",
    "    vec3 mundo = cantoDaCaixa(centro, c, s);",
    // o padrão é medido na caixa ainda sem giro, para os tijolos ficarem
    // alinhados com as faces mesmo numa caixa girada
    "    vec3 q = mundo - centro;",
    "    vec3 local = mundo + (giraY(q, c, -s) - q);",
    "    vec2 uv = abs(aNormal.y) > 0.5 ? local.xz : vec2(local.x * aNormal.z - local.z * aNormal.x, local.y);",
    // os cantos de baixo ficam um pouco mais escuros: parece que a caixa
    // está apoiada no chão
    "    float ao = aPosicao.y < 0.5 ? 0.8 : 1.0;",
    "    saida(mundo, giraY(aNormal, c, s), vec4(iCor, ao), vec3(uv, iParam.x));",
    "}"
].join("\n");

// Shader de fragmentos da cena: material, luz, sombra, clarão e névoa.
var GLSL_CENA_FRAGMENTO = [
    GLSL_PRECISAO,
    "varying vec3 vMundo;",
    "varying vec3 vNormal;",
    "varying vec4 vCor;",
    "varying vec3 vPadrao;",
    "uniform vec3 uOlho;",
    "uniform vec3 uLuzCor;",
    "uniform vec3 uParaLuz;",
    "uniform vec3 uAmbiente;",
    "uniform vec3 uChaoLuz;",
    "uniform vec3 uNevoaCor;",
    "uniform vec2 uNevoa;",         // início, 1 / (fim - início)
    "uniform float uBranco;",
    "uniform float uPixelMundo;",   // tamanho de um pixel da tela a 1 unidade de distância
    "#ifdef SOMBRA",
    "varying vec4 vSombra;",
    "uniform sampler2D uMapaSombra;",
    "uniform vec2 uSombraInfo;",    // lado do mapa em texels, viés
    // a profundidade vista pelo sol foi guardada em 4 bytes (RGBA)
    "float luzNoTexel(vec2 uv, float prof) {",
    "    vec4 e = texture2D(uMapaSombra, uv);",
    "    return step(prof, dot(e, vec4(1.0, 1.0 / 255.0, 1.0 / 65025.0, 1.0 / 16581375.0)));",
    "}",
    // PCF: compara 4 texels vizinhos e mistura, para a borda ficar macia
    "float calculaSombra(float ndl) {",
    "    vec3 p = vSombra.xyz * 0.5 + 0.5;",
    "    if (p.x <= 0.0 || p.y <= 0.0 || p.x >= 1.0 || p.y >= 1.0 || p.z >= 1.0) {",
    "        return 1.0;",
    "    }",
    // viés maior quando a luz chega de lado na superfície
    "    float inclinacao = min(sqrt(1.0 - ndl * ndl) / ndl, 4.0);",
    "    float prof = p.z - uSombraInfo.y * (1.0 + inclinacao);",
    "    vec2 t = p.xy * uSombraInfo.x - 0.5;",
    "    vec2 f = fract(t);",
    "    float passo = 1.0 / uSombraInfo.x;",
    "    vec2 base = (floor(t) + 0.5) * passo;",
    "    float a = luzNoTexel(base, prof);",
    "    float b = luzNoTexel(base + vec2(passo, 0.0), prof);",
    "    float c = luzNoTexel(base + vec2(0.0, passo), prof);",
    "    float d = luzNoTexel(base + vec2(passo, passo), prof);",
    "    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);",
    "}",
    "#endif",
    // número "sorteado" a partir de um ponto (sem seno, estável em qualquer placa)
    "float sorteia(vec2 p) {",
    "    vec3 p3 = fract(vec3(p.xyx) * 0.1031);",
    "    p3 += dot(p3, p3.yzx + 33.33);",
    "    return fract((p3.x + p3.y) * p3.z);",
    "}",
    // ruído suave: mistura os sorteios dos 4 cantos da célula
    "float ruido(vec2 p) {",
    "    vec2 i = floor(p);",
    "    vec2 f = fract(p);",
    "    f = f * f * (3.0 - 2.0 * f);",
    "    float a = sorteia(i);",
    "    float b = sorteia(i + vec2(1.0, 0.0));",
    "    float c = sorteia(i + vec2(0.0, 1.0));",
    "    float d = sorteia(i + vec2(1.0, 1.0));",
    "    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);",
    "}",
    // Linha de junta com borda suave. "pe" é quanto um pixel da tela mede
    // em cima da superfície: a borda nunca fica mais fina do que um pixel,
    // então as linhas não serrilham nem cintilam de longe.
    "float junta(float d, float meia, float pe) {",
    "    return 1.0 - smoothstep(meia - pe, meia + pe, d);",
    "}",
    // tijolos de 22 x 11, fileiras desencontradas, argamassa escura
    "float tijolo(vec2 uv, float pe) {",
    "    vec2 q = uv / vec2(22.0, 11.0);",
    "    q.x += mod(floor(q.y), 2.0) * 0.5;",
    "    vec2 f = fract(q);",
    "    float d = min(min(f.x, 1.0 - f.x) * 22.0, min(f.y, 1.0 - f.y) * 11.0);",
    "    float k = 0.92 + sorteia(floor(q)) * 0.16 + (ruido(uv * 0.5) - 0.5) * 0.08;",
    "    k = mix(k, 0.58, junta(d, 0.75, pe));",
    // bem de longe o desenho some e fica só o tom médio
    "    return mix(k, 0.93, smoothstep(1.2, 4.0, pe));",
    "}",
    // gomos verticais do cacto (claro na crista, escuro no sulco) e
    // pontinhos claros de espinhos
    "float cacto(vec2 uv, float pe) {",
    "    float x = uv.x / 5.5;",
    "    float k = 0.72 + 0.32 * sqrt(max(sin(3.14159 * fract(x)), 0.0));",
    "    float y = uv.y / 9.0 + mod(floor(x), 2.0) * 0.5;",
    "    vec2 d = vec2((fract(x) - 0.5) * 5.5, (fract(y) - 0.5) * 9.0);",
    "    float espinho = 1.0 - smoothstep(0.65 - pe, 0.65 + pe, length(d));",
    "    k += espinho * 0.5 * (1.0 - smoothstep(0.8, 2.2, pe));",
    "    return mix(k, 0.95, smoothstep(1.5, 4.0, pe));",
    "}",
    // tábuas de 8 de largura com veio; nas faces de cima as tábuas
    // atravessam no sentido do Z, como num tablado
    "float madeira(vec2 uv, float pe, float topo) {",
    "    float atravessa = mix(uv.y, uv.x, topo);",
    "    float aoLongo = mix(uv.x, uv.y, topo);",
    "    float t = atravessa / 8.0;",
    "    float id = floor(t);",
    "    float d = min(fract(t), 1.0 - fract(t)) * 8.0;",
    "    float k = 0.92 + sorteia(vec2(id, 3.7)) * 0.14;",
    "    float veio = ruido(vec2(aoLongo * 0.06 + id * 7.3, atravessa * 0.9));",
    "    k += (veio - 0.5) * 0.14 * (1.0 - smoothstep(0.7, 2.5, pe));",
    "    k = mix(k, 0.6, junta(d, 0.55, pe));",
    "    return mix(k, 0.95, smoothstep(1.2, 3.5, pe));",
    "}",
    // areia: manchas grandes e suaves mais um grão fino (no máximo 6%)
    "float areia(vec2 uv, float pe) {",
    "    float suave = ruido(uv / 70.0) * 0.65 + ruido(uv / 23.0) * 0.35;",
    "    float grao = sorteia(floor(uv / 3.0));",
    "    return 1.0 + (suave - 0.5) * 0.08 + (grao - 0.5) * 0.04 * (1.0 - smoothstep(0.8, 2.5, pe));",
    "}",
    "void main() {",
    "    vec3 n = normalize(vNormal);",
    "    vec3 paraOlho = uOlho - vMundo;",
    "    float dist = max(length(paraOlho), 0.001);",
    "    float nevoa = clamp((dist - uNevoa.x) * uNevoa.y, 0.0, 1.0);",
    "    float material = floor(vPadrao.z + 0.5);",
    "    vec3 albedo = vCor.rgb;",
    // BRILHO: brilha sozinho, sem luz nem sombra, e quase não pega névoa
    "    if (material > 4.5) {",
    "        gl_FragColor = vec4(mix(albedo, uNevoaCor, nevoa * 0.25), 1.0);",
    "        return;",
    "    }",
    "    if (material > 0.5) {",
    "        float pe = dist * uPixelMundo / max(abs(dot(n, paraOlho)) / dist, 0.2);",
    "        float k = 1.0;",
    "        if (material < 1.5) {",
    "            k = tijolo(vPadrao.xy, pe);",
    "        } else if (material < 2.5) {",
    "            k = cacto(vPadrao.xy, pe);",
    "        } else if (material < 3.5) {",
    "            k = madeira(vPadrao.xy, pe, step(0.5, abs(n.y)));",
    "        } else {",
    "            k = areia(vPadrao.xy, pe);",
    "        }",
    "        albedo *= k;",
    "    }",
    // luz: céu e chão (hemisfério) vezes a oclusão + sol vezes a sombra
    "    float ndl = max(dot(n, uParaLuz), 0.0);",
    "    float sombra = 1.0;",
    "#ifdef SOMBRA",
    "    if (ndl > 0.0) {",
    "        sombra = calculaSombra(ndl);",
    "    }",
    "#endif",
    "    vec3 hemisferio = mix(uChaoLuz, uAmbiente, n.y * 0.5 + 0.5);",
    "    vec3 cor = albedo * (hemisferio * vCor.a + uLuzCor * (ndl * sombra));",
    "    cor = mix(cor, vec3(1.0), uBranco);",
    "    cor = mix(cor, uNevoaCor, nevoa);",
    "    gl_FragColor = vec4(cor, 1.0);",
    "}"
].join("\n");

// ----- passo da sombra: só a profundidade, vista do sol -----
var GLSL_SOMBRA_MALHA_VERTICE = [
    "attribute vec3 aPosicao;",
    "uniform mat4 uLuzVP;",
    "uniform vec4 uTransforma;",
    GLSL_GIRA,
    "void main() {",
    "    vec3 mundo = giraY(aPosicao, cos(uTransforma.w), sin(uTransforma.w)) + uTransforma.xyz;",
    "    gl_Position = uLuzVP * vec4(mundo, 1.0);",
    "}"
].join("\n");

var GLSL_SOMBRA_CAIXA_VERTICE = [
    "attribute vec3 aPosicao;",
    "attribute vec3 iPosicao;",
    "attribute vec3 iTamanho;",
    "attribute vec4 iParam;",
    "uniform mat4 uLuzVP;",
    GLSL_GIRA,
    GLSL_CENA_CANTO,
    "void main() {",
    // o que brilha (as balas) não faz sombra: o vértice vai para fora da tela
    "    if (iParam.x > 4.5) {",
    "        gl_Position = vec4(0.0, 0.0, 2.0, 1.0);",
    "        return;",
    "    }",
    "    vec3 mundo = cantoDaCaixa(iPosicao + iTamanho * 0.5, cos(iParam.y), sin(iParam.y));",
    "    gl_Position = uLuzVP * vec4(mundo, 1.0);",
    "}"
].join("\n");

// A profundidade (de 0 a 1) é guardada nos 4 bytes de uma cor RGBA comum:
// funciona até no WebGL 1, que não tem textura de profundidade garantida.
var GLSL_SOMBRA_FRAGMENTO = [
    GLSL_PRECISAO,
    "void main() {",
    "    float v = min(gl_FragCoord.z, 0.99999);",
    "    vec4 e = fract(v * vec4(1.0, 255.0, 65025.0, 16581375.0));",
    "    gl_FragColor = e - e.yzww * vec4(1.0 / 255.0, 1.0 / 255.0, 1.0 / 255.0, 0.0);",
    "}"
].join("\n");

// ----- céu -----
// Um triângulo que cobre a tela toda, no fundo da profundidade (1.0). Ele é
// desenhado DEPOIS da cena: só os pixels onde não há nada é que são pintados.
var GLSL_CEU_VERTICE = [
    "attribute vec2 aPosicao;",
    "varying vec2 vTela;",
    "void main() {",
    "    vTela = aPosicao;",
    "    gl_Position = vec4(aPosicao, 1.0, 1.0);",
    "}"
].join("\n");

var GLSL_CEU_FRAGMENTO = [
    GLSL_PRECISAO,
    "varying vec2 vTela;",
    "uniform vec3 uFrente;",        // eixos da câmera; direita e cima já
    "uniform vec3 uDireita;",       // multiplicados pela abertura da lente
    "uniform vec3 uCima;",
    "uniform vec3 uTopo;",
    "uniform vec3 uHorizonte;",
    "uniform vec3 uSol;",           // direção do sol (contrária à da luz)
    "uniform vec3 uLuzCor;",
    "uniform vec3 uNevoaCor;",
    "void main() {",
    // direção do raio que sai da câmera por este pixel (sem matriz inversa)
    "    vec3 raio = normalize(uFrente + uDireita * vTela.x + uCima * vTela.y);",
    "    float e = raio.y;",
    "    vec3 cor = mix(uHorizonte, uTopo, pow(smoothstep(0.0, 0.8, e), 0.8));",
    // perto do horizonte o céu se mistura com a névoa, para as mesas
    // distantes não ficarem recortadas
    "    cor = mix(cor, uNevoaCor, (1.0 - smoothstep(-0.03, 0.12, e)) * 0.5);",
    "    float d = max(dot(raio, uSol), 0.0);",
    "    float disco = smoothstep(0.99935, 0.9997, d);",
    "    cor += uLuzCor * (disco * 0.85 + pow(d, 300.0) * 0.35 + pow(d, 12.0) * 0.12);",
    // um pouco de ruído para o degradê não fazer faixas
    "    float r = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);",
    "    gl_FragColor = vec4(cor + (r - 0.5) / 255.0, 1.0);",
    "}"
].join("\n");

// ----- brilhos -----
// Quadrados sempre virados para a câmera, somados à imagem (mistura
// aditiva): onde dois brilhos se cruzam fica mais claro, como luz de verdade.
var GLSL_BRILHO_VERTICE = [
    "attribute vec3 aPosicao;",     // canto do quadrado (-1 a 1)
    "attribute vec4 iCentro;",      // x, y, z, raio
    "attribute vec4 iCorBrilho;",   // r, g, b, intensidade
    "uniform mat4 uVP;",
    "uniform vec3 uOlho;",
    "uniform vec3 uDireita;",
    "uniform vec3 uCima;",
    "uniform vec2 uNevoa;",
    "varying vec2 vCanto;",
    "varying vec4 vCor;",
    "void main() {",
    "    vec3 paraOlho = uOlho - iCentro.xyz;",
    "    float dist = max(length(paraOlho), 0.001);",
    // o quadrado vem um pouco para a frente, para não entrar no que está
    // logo atrás dele (o braço do pistoleiro, o chão)
    "    vec3 centro = iCentro.xyz + paraOlho / dist * min(iCentro.w * 0.5, dist * 0.5);",
    "    vec3 p = centro + (uDireita * aPosicao.x + uCima * aPosicao.y) * iCentro.w;",
    "    float nevoa = clamp((dist - uNevoa.x) * uNevoa.y, 0.0, 1.0);",
    "    float forca = iCorBrilho.a * (1.0 - nevoa * 0.8);",
    "    vCor = vec4(iCorBrilho.rgb * forca, forca * 0.6);",
    "    vCanto = aPosicao.xy;",
    "    gl_Position = uVP * vec4(p, 1.0);",
    "}"
].join("\n");

var GLSL_BRILHO_FRAGMENTO = [
    GLSL_PRECISAO,
    "varying vec2 vCanto;",
    "varying vec4 vCor;",
    "void main() {",
    "    float f = max(1.0 - dot(vCanto, vCanto), 0.0);",
    "    float halo = f * f;",
    "    float nucleo = halo * halo * halo * halo;",
    "    gl_FragColor = vec4(vCor.rgb * halo + vec3(nucleo * vCor.a), 1.0);",
    "}"
].join("\n");

// ----- sombras redondas (qualidade baixa) -----
var GLSL_BOLHA_VERTICE = [
    "attribute vec3 aPosicao;",
    "attribute vec4 iBolha;",       // x, z, raio, força
    "uniform mat4 uVP;",
    "varying vec2 vCanto;",
    "varying float vForca;",
    "void main() {",
    "    vec3 p = vec3(iBolha.x + aPosicao.x * iBolha.z, 0.6, iBolha.y + aPosicao.y * iBolha.z * 0.8);",
    "    vCanto = aPosicao.xy;",
    "    vForca = iBolha.w;",
    "    gl_Position = uVP * vec4(p, 1.0);",
    "}"
].join("\n");

var GLSL_BOLHA_FRAGMENTO = [
    GLSL_PRECISAO,
    "varying vec2 vCanto;",
    "varying float vForca;",
    "void main() {",
    "    float r = length(vCanto);",
    "    gl_FragColor = vec4(0.0, 0.0, 0.0, vForca * (1.0 - smoothstep(0.35, 1.0, r)));",
    "}"
].join("\n");

// nomes de todos os "uniforms" (valores que o processador manda para os shaders)
var NOMES_DOS_UNIFORMS = [
    "uVP", "uTransforma", "uLuzVP", "uDeslocaSombra", "uOlho", "uLuzCor", "uParaLuz",
    "uAmbiente", "uChaoLuz", "uNevoaCor", "uNevoa", "uBranco", "uPixelMundo",
    "uMapaSombra", "uSombraInfo", "uFrente", "uDireita", "uCima", "uTopo", "uHorizonte", "uSol"
];

/* ----------------------------- Malha ----------------------------- */

// Uma malha é uma lista de triângulos já guardada na memória da placa de
// vídeo. Ela também guarda uma cópia na memória do navegador: se o sistema
// "perder" o contexto 3D (troca de placa, driver reiniciado), o motor
// manda tudo de novo sem o jogo nem perceber.
class Malha {
    numVertices = 0;
    min = [0, 0, 0];        // canto mínimo da caixa que envolve a malha
    max = [0, 0, 0];        // canto máximo
    dados = null;           // Float32Array com os vértices (cópia na memória)
    buffer = null;          // os mesmos vértices na placa de vídeo

    constructor(dados, numVertices) {
        if (!dados || !(numVertices > 0)) {
            return;         // malha vazia: desenhar ela não faz nada
        }
        this.dados = dados;
        this.numVertices = numVertices;
        this.min = [Infinity, Infinity, Infinity];
        this.max = [-Infinity, -Infinity, -Infinity];
        for (var k = 0; k < numVertices * FLOATS_POR_VERTICE; k += FLOATS_POR_VERTICE) {
            for (var e = 0; e < 3; e++) {
                if (dados[k + e] < this.min[e]) { this.min[e] = dados[k + e]; }
                if (dados[k + e] > this.max[e]) { this.max[e] = dados[k + e]; }
            }
        }
    }
}

/* ---------------------------- Pincel3D --------------------------- */

class Pincel3D {
    ok = false;             // false quando o navegador não tem WebGL
    webgl2 = false;
    larguraHud = 900;       // tamanho do placar (HUD) usado por projeta()
    alturaHud = 640;
    chamadas = 0;           // chamadas de desenho do último quadro (para conferir)

    // canvas: o <canvas> do jogo; o tamanho dele na tela vem do CSS
    // opcoes: { forcaWebgl1: true } usa o WebGL 1 mesmo que exista o 2 (testes)
    constructor(canvas, opcoes) {
        var este = this;
        this.canvas = canvas || null;
        this.gl = null;
        this.perdido = false;           // contexto 3D perdido (esperando voltar)
        this.mapaSombra = null;         // null = sem mapa (qualidade baixa ou placa fraca)
        this.cronometro = null;         // medidas de tempo da placa (veja preparaCronometro)
        this.programaAtual = null;
        this.atributosAtivos = 0;
        this.nivel = "alta";
        this.fatorEscala = 1;           // resolução dinâmica (0.5 a 1)
        this.avisos = {};               // avisos que já apareceram no console

        // matrizes e vetores reaproveitados em todos os quadros
        this.vista = new Float32Array(16);
        this.projecao = new Float32Array(16);
        this.vp = new Float32Array(16);
        this.vistaLuz = new Float32Array(16);
        this.projecaoLuz = new Float32Array(16);
        this.luzVP = new Float32Array(16);
        this.olho = new Float32Array(3);
        this.frente = new Float32Array([0, 0, -1]);
        this.direita = new Float32Array([1, 0, 0]);
        this.cima = new Float32Array([0, 1, 0]);
        this.fov = 40 * Math.PI / 180;
        this.aspectoCamera = 900 / 640;
        this.temCamera = false;
        this.pedidoCamera = new Float64Array(7);    // olho, alvo e abertura do último pedido
        matrizPerspectiva(this.projecao, this.fov, this.aspectoCamera, PLANO_PERTO, PLANO_LONGE);

        // filas do quadro (a memória é separada uma vez só)
        this.filaMalhas = [];
        for (var i = 0; i < LIMITE_MALHAS; i++) {
            this.filaMalhas.push(null);
        }
        this.dadosMalhas = new Float32Array(LIMITE_MALHAS * 5);  // x, y, z, giro, branco
        this.numMalhas = 0;
        // "janelas" para dentro de dadosMalhas, criadas uma vez só: cada
        // malha manda os seus valores ao shader sem criar nada novo
        this.vistasTransforma = [];
        this.vistasBranco = [];
        for (i = 0; i < LIMITE_MALHAS; i++) {
            this.vistasTransforma.push(this.dadosMalhas.subarray(i * 5, i * 5 + 4));
            this.vistasBranco.push(this.dadosMalhas.subarray(i * 5 + 4, i * 5 + 5));
        }
        // Os valores dos uniforms ficam em Float32Array e vão com uniform*fv.
        // Passar números soltos (uniform3f) obrigaria o navegador a embrulhar
        // cada número quebrado num objeto novo, a cada quadro.
        this.paraLuz = new Float32Array(3);         // contrário da direção da luz
        this.nevoaParams = new Float32Array(2);     // início, 1 / (fim - início)
        this.ceuDireita = new Float32Array(3);      // eixos da câmera já multiplicados
        this.ceuCima = new Float32Array(3);         // pela abertura da lente (céu)
        this.pixelMundo = new Float32Array(1);
        this.sombraInfo = new Float32Array(2);      // lado do mapa, viés
        this.deslocaSombra = new Float32Array(1);
        this.filaCaixas = this.criaFila(LIMITE_CAIXAS, FLOATS_POR_CAIXA);
        this.filaBrilhos = this.criaFila(LIMITE_BRILHOS, FLOATS_POR_BRILHO);
        this.filaBolhas = this.criaFila(LIMITE_BOLHAS, FLOATS_POR_BOLHA);
        this.recorteMin = -SEM_RECORTE;
        this.recorteMax = SEM_RECORTE;

        // cores já convertidas de "#rrggbb" para números
        this.cores = new Map();
        this.ultimaCor = null;
        this.ultimoRgb = null;

        // todas as malhas vivas (para refazer se o contexto for perdido)
        this.malhas = new Set();

        // ambiente padrão, até o jogo mandar o dele
        this.amb = {
            ceuTopo: this.rgb("#2a3d8f"), ceuHorizonte: this.rgb("#f0b080"),
            luz: this.rgb("#fff4e0"), ambiente: this.rgb("#7080c0"), chaoLuz: this.rgb("#403030"),
            nevoa: this.rgb("#c09080"), nevoaInicio: 1400, nevoaFim: 4200
        };
        this.calculaNevoa();
        this.dirLuz = new Float32Array(3);      // para onde a luz do sol anda (normalizada)
        this.luzPedida = [NaN, NaN, NaN];       // a última direção que o jogo mandou
        this.vetorLuz = null;                   // e o vetor em que ela veio
        this.larguraLuz = 1;
        this.viesLuz = 0;
        this.pontosLuz = new Float64Array(6);    // olho e alvo da câmera do sol
        this.defineDirecaoDaLuz([-0.45, -1, -0.55]);

        // medida do tempo de cada quadro (resolução dinâmica, veja medeTempo)
        this.ultimoQuadro = -1;                 // quando o último quadro terminou (ms)
        this.tempos = new Float32Array(256);    // intervalos da janela atual
        this.zeraResolucao();

        // tamanho do canvas na tela (em pixels do CSS) e pixels da tela por
        // pixel do CSS (veja vigiaDensidade)
        this.cssLargura = 0;
        this.cssAltura = 0;
        this.observador = null;
        this.densidade = 1;
        this.densidadeVigiada = false;

        if (!this.canvas || typeof this.canvas.getContext !== "function") {
            return;
        }

        // ----- contexto WebGL: tenta o 2, depois o 1 -----
        var atributos = {
            antialias: true, alpha: false, depth: true, stencil: false,
            premultipliedAlpha: false, preserveDrawingBuffer: false,
            powerPreference: "high-performance"
        };
        var gl = null;
        try {
            if (!(opcoes && opcoes.forcaWebgl1)) {
                gl = this.canvas.getContext("webgl2", atributos);
            }
            if (gl) {
                this.webgl2 = true;
            } else {
                gl = this.canvas.getContext("webgl", atributos) ||
                    this.canvas.getContext("experimental-webgl", atributos);
            }
        } catch (erro) {
            gl = null;
        }
        if (!gl) {
            this.webgl2 = false;
            console.warn("Pincel3D: este navegador não tem WebGL.");
            return;
        }
        this.gl = gl;

        try {
            this.ok = this.iniciaGL();
        } catch (erro) {
            console.error("Pincel3D: erro ao preparar o WebGL:", erro);
            this.ok = false;
        }
        if (!this.ok) {
            this.webgl2 = false;
            return;
        }

        // ----- contexto perdido e recuperado -----
        // O sistema pode "tirar" a placa de vídeo da página (driver
        // reiniciado, muitas abas com 3D). Avisamos que queremos o contexto
        // de volta (preventDefault) e, quando ele volta, refazemos tudo.
        this.canvas.addEventListener("webglcontextlost", function (evento) {
            evento.preventDefault();
            este.perdido = true;
            este.esqueceGL();
        }, false);
        this.canvas.addEventListener("webglcontextrestored", function () {
            var pronto = false;
            try {
                pronto = este.iniciaGL();
            } catch (erro) {
                if (!este.gl.isContextLost()) {
                    console.error("Pincel3D: erro ao refazer o WebGL:", erro);
                }
            }
            if (!pronto && este.gl.isContextLost()) {
                return;     // perdeu de novo no meio do caminho: espera a próxima volta
            }
            este.ok = pronto;
            este.perdido = false;
        }, false);

        // ----- tamanho na tela -----
        // O ResizeObserver avisa só quando o tamanho muda; sem ele, o tamanho
        // é conferido uma vez por quadro.
        this.cssLargura = this.canvas.clientWidth;
        this.cssAltura = this.canvas.clientHeight;
        if (typeof ResizeObserver === "function") {
            this.observador = new ResizeObserver(function (entradas) {
                var r = entradas[entradas.length - 1].contentRect;
                if (r.width !== este.cssLargura || r.height !== este.cssAltura) {
                    este.cssLargura = r.width;
                    este.cssAltura = r.height;
                    este.tamanhoMudou();
                }
            });
            this.observador.observe(this.canvas);
        }
        this.vigiaDensidade();
    }

    // ----- qualidade -----
    // alta: sombra de 2048, até 2 pixels por pixel da tela
    // media: sombra de 1024, 1 pixel por pixel
    // baixa: sem mapa de sombra (sombras redondas), 0.75 pixel por pixel
    get qualidade() {
        return this.nivel;
    }

    set qualidade(valor) {
        if (valor === "média") {
            valor = "media";
        }
        if (valor !== "alta" && valor !== "media" && valor !== "baixa") {
            return;
        }
        this.nivel = valor;
        // começa de novo a medir a resolução dinâmica
        this.zeraResolucao();
        if (this.ok && !this.perdido) {
            this.aplicaQualidade();
        }
    }

    // fator da resolução dinâmica (só leitura)
    get escala() {
        return this.fatorEscala;
    }

    /* ----- recursos ----- */

    // Monta uma malha de cubinhos. lista: [[ix, iy, iz, "#rrggbb"], ...]
    // tamanho: lado de cada cubo no mundo; origem: [x, y, z] somado a tudo.
    criaMalhaVoxels(lista, tamanho, origem) {
        if (!this.ok || !lista || lista.length === 0) {
            return new Malha(null, 0);
        }
        var lado = tamanho > 0 ? tamanho : 1;
        var ox = origem ? (origem[0] || 0) : 0;
        var oy = origem ? (origem[1] || 0) : 0;
        var oz = origem ? (origem[2] || 0) : 0;

        // 1. mapa de ocupação: chave numérica -> posição na lista
        // (um voxel repetido fica com o último da lista)
        var mapa = new Map();
        var coords = new Int32Array(lista.length * 3);
        var i, f, c;
        for (i = 0; i < lista.length; i++) {
            coords[i * 3] = Math.round(lista[i][0]);
            coords[i * 3 + 1] = Math.round(lista[i][1]);
            coords[i * 3 + 2] = Math.round(lista[i][2]);
            mapa.set(chaveDoVoxel(coords[i * 3], coords[i * 3 + 1], coords[i * 3 + 2]), i);
        }
        function ocupado(x, y, z) {
            return mapa.has(chaveDoVoxel(x, y, z));
        }

        // 2. conta só as faces que aparecem (o vizinho daquele lado está vazio)
        var faces = 0;
        for (i = 0; i < lista.length; i++) {
            var x = coords[i * 3], y = coords[i * 3 + 1], z = coords[i * 3 + 2];
            if (mapa.get(chaveDoVoxel(x, y, z)) !== i) {
                continue;
            }
            for (f = 0; f < 6; f++) {
                var n = FACES_DO_CUBO[f].n;
                if (!ocupado(x + n[0], y + n[1], z + n[2])) {
                    faces++;
                }
            }
        }

        // 3. escreve os vértices de cada face visível
        var dados = new Float32Array(faces * 6 * FLOATS_POR_VERTICE);
        var k = 0;
        var ao = [0, 0, 0, 0];
        var px = [0, 0, 0, 0], py = [0, 0, 0, 0], pz = [0, 0, 0, 0];
        var ordemNormal = [0, 1, 2, 0, 2, 3];
        var ordemVirada = [1, 2, 3, 1, 3, 0];
        for (i = 0; i < lista.length; i++) {
            var vx = coords[i * 3], vy = coords[i * 3 + 1], vz = coords[i * 3 + 2];
            if (mapa.get(chaveDoVoxel(vx, vy, vz)) !== i) {
                continue;
            }
            var cor = this.rgb(lista[i][3]);
            // cada cubinho fica até 3% mais claro ou mais escuro
            var brilho = 1 + (sorteioDoVoxel(vx, vy, vz) - 0.5) * 0.06;
            for (f = 0; f < 6; f++) {
                var face = FACES_DO_CUBO[f];
                var fn = face.n, fu = face.u, fv = face.v;
                // camada de vizinhos do lado de fora da face
                var lx = vx + fn[0], ly = vy + fn[1], lz = vz + fn[2];
                if (ocupado(lx, ly, lz)) {
                    continue;       // face escondida: não desenha
                }
                for (c = 0; c < 4; c++) {
                    var a = CANTOS_DA_FACE[c][0], b = CANTOS_DA_FACE[c][1];
                    px[c] = (vx + (fn[0] > 0 ? 1 : 0) + a * fu[0] + b * fv[0]) * lado + ox;
                    py[c] = (vy + (fn[1] > 0 ? 1 : 0) + a * fu[1] + b * fv[1]) * lado + oy;
                    pz[c] = (vz + (fn[2] > 0 ? 1 : 0) + a * fu[2] + b * fv[2]) * lado + oz;
                    // Oclusão de ambiente: os dois vizinhos dos lados e o da
                    // diagonal, na camada de fora. Com os dois lados ocupados
                    // o canto fica bem escuro.
                    var su = a ? 1 : -1, sv = b ? 1 : -1;
                    var lado1 = ocupado(lx + su * fu[0], ly + su * fu[1], lz + su * fu[2]) ? 1 : 0;
                    var lado2 = ocupado(lx + sv * fv[0], ly + sv * fv[1], lz + sv * fv[2]) ? 1 : 0;
                    var canto = ocupado(lx + su * fu[0] + sv * fv[0], ly + su * fu[1] + sv * fv[1],
                        lz + su * fu[2] + sv * fv[2]) ? 1 : 0;
                    ao[c] = NIVEIS_AO[(lado1 && lado2) ? 0 : 3 - (lado1 + lado2 + canto)];
                }
                // O quadrado vira dois triângulos. A diagonal liga os dois
                // cantos mais claros: assim a sombra fica no canto e não
                // escorre em listra pela face.
                var ordem = (ao[0] + ao[2] < ao[1] + ao[3]) ? ordemVirada : ordemNormal;
                for (c = 0; c < 6; c++) {
                    var q = ordem[c];
                    k = escreveVertice(dados, k, px[q], py[q], pz[q], fn[0], fn[1], fn[2],
                        MATERIAL.LISO, cor, brilho, ao[q], 0, 0);
                }
            }
        }
        return this.registraMalha(new Malha(dados, faces * 6));
    }

    // Junta muitas caixas paradas (o cenário) numa malha só: o cenário
    // inteiro vira uma única chamada de desenho.
    // caixas: [{ x, y, z, l, a, p, cor, material, rotY }, ...] (x, y, z = canto mínimo)
    criaMalhaCaixas(caixas) {
        if (!this.ok || !caixas || caixas.length === 0) {
            return new Malha(null, 0);
        }
        var i, f, c;
        var validas = 0;
        for (i = 0; i < caixas.length; i++) {
            if (caixas[i] && caixas[i].l > 0 && caixas[i].a > 0 && caixas[i].p > 0) {
                validas++;
            }
        }
        var dados = new Float32Array(validas * 36 * FLOATS_POR_VERTICE);
        var k = 0;
        var px = [0, 0, 0, 0], py = [0, 0, 0, 0], pz = [0, 0, 0, 0];
        var pu = [0, 0, 0, 0], pv = [0, 0, 0, 0], ao = [0, 0, 0, 0];
        var ordem = [0, 1, 2, 0, 2, 3];
        for (i = 0; i < caixas.length; i++) {
            var cx = caixas[i];
            if (!(cx && cx.l > 0 && cx.a > 0 && cx.p > 0)) {
                continue;
            }
            var cor = this.rgb(cx.cor);
            var material = cx.material || 0;
            var giro = cx.rotY || 0;
            var cos = Math.cos(giro), sen = Math.sin(giro);
            var meioX = cx.x + cx.l / 2, meioZ = cx.z + cx.p / 2;
            for (f = 0; f < 6; f++) {
                var face = FACES_DO_CUBO[f];
                var fn = face.n, fu = face.u, fv = face.v;
                for (c = 0; c < 4; c++) {
                    var a = CANTOS_DA_FACE[c][0], b = CANTOS_DA_FACE[c][1];
                    var qx = (fn[0] > 0 ? 1 : 0) + a * fu[0] + b * fv[0];
                    var qy = (fn[1] > 0 ? 1 : 0) + a * fu[1] + b * fv[1];
                    var qz = (fn[2] > 0 ? 1 : 0) + a * fu[2] + b * fv[2];
                    // canto ainda sem giro (é nele que o padrão é medido)
                    var lx = cx.x + qx * cx.l, ly = cx.y + qy * cx.a, lz = cx.z + qz * cx.p;
                    if (fn[1] === 0) {
                        pu[c] = lx * fn[2] - lz * fn[0];
                        pv[c] = ly;
                    } else {
                        pu[c] = lx;
                        pv[c] = lz;
                    }
                    // gira em torno do centro da caixa (só a diferença entra
                    // na conta: sem giro, o canto fica exatamente onde estava
                    // e encosta certinho na caixa vizinha)
                    var dx = lx - meioX, dz = lz - meioZ;
                    px[c] = lx + (dx * cos + dz * sen - dx);
                    py[c] = ly;
                    pz[c] = lz + (dz * cos - dx * sen - dz);
                    // sombra de contato falsa: embaixo um pouco mais escuro
                    ao[c] = qy === 0 ? 0.8 : 1.0;
                }
                var nx = fn[0] * cos + fn[2] * sen, nz = fn[2] * cos - fn[0] * sen;
                for (c = 0; c < 6; c++) {
                    var o = ordem[c];
                    k = escreveVertice(dados, k, px[o], py[o], pz[o], nx, fn[1], nz,
                        material, cor, 1, ao[o], pu[o], pv[o]);
                }
            }
        }
        return this.registraMalha(new Malha(dados, validas * 36));
    }

    // devolve a memória da placa de vídeo (a malha não pode mais ser desenhada)
    liberaMalha(malha) {
        if (!this.ok || !malha) {
            return;
        }
        if (malha.buffer && this.gl) {
            this.gl.deleteBuffer(malha.buffer);
        }
        this.malhas.delete(malha);
        malha.buffer = null;
        malha.dados = null;
        malha.numVertices = 0;
    }

    /* ----- a cada quadro (o jogo chama dentro do draw()) ----- */

    // As ordens abaixo só anotam números nas filas, que já existem mesmo
    // sem WebGL (aí nada é desenhado, porque terminaQuadro não faz nada).
    // Por isso elas nem conferem o "ok": quanto menores, mais fácil o
    // navegador embuti-las no código do jogo, sem criar um objeto para
    // cada número quebrado passado a elas.

    comecaQuadro() {
        this.numMalhas = 0;
        this.filaCaixas.quantidade = 0;
        this.filaBrilhos.quantidade = 0;
        this.filaBolhas.quantidade = 0;
        this.recorteMin = -SEM_RECORTE;
        this.recorteMax = SEM_RECORTE;
    }

    // câmera no ponto "olho" olhando para o "alvo"; fovGraus = abertura vertical
    // Aqui os números só são guardados: as contas ficam em calculaCamera().
    // Um método pequeno assim o navegador consegue embutir em quem chama,
    // sem embrulhar cada número quebrado num objeto novo.
    defineCamera(olhoX, olhoY, olhoZ, alvoX, alvoY, alvoZ, fovGraus) {
        var c = this.pedidoCamera;
        c[0] = olhoX; c[1] = olhoY; c[2] = olhoZ;
        c[3] = alvoX; c[4] = alvoY; c[5] = alvoZ;
        c[6] = fovGraus;
        this.calculaCamera();
    }

    calculaCamera() {
        if (!this.ok) {
            return;
        }
        var c = this.pedidoCamera;
        var fx = c[3] - c[0], fy = c[4] - c[1], fz = c[5] - c[2];
        if (!(fx * fx + fy * fy + fz * fz > 1e-8)) {
            return;         // olho em cima do alvo (ou número inválido): mantém a anterior
        }
        var fovGraus = c[6];
        this.fov = (fovGraus > 1 && fovGraus < 170 ? fovGraus : 40) * Math.PI / 180;
        this.medeAspecto();
        matrizOlhaPara(this.vista, c);
        // Da perspectiva só a abertura e a proporção mudam de um quadro para
        // outro: o resto da matriz foi preenchido uma vez, no começo.
        var p = this.projecao;
        var tanV = Math.tan(this.fov / 2);
        p[0] = 1 / (tanV * this.aspectoCamera);
        p[5] = 1 / tanV;
        matrizMultiplica(this.vp, p, this.vista);
        // eixos da câmera, tirados da própria matriz (usados pelo céu e pelos brilhos)
        var v = this.vista;
        this.direita[0] = v[0]; this.direita[1] = v[4]; this.direita[2] = v[8];
        this.cima[0] = v[1]; this.cima[1] = v[5]; this.cima[2] = v[9];
        this.frente[0] = -v[2]; this.frente[1] = -v[6]; this.frente[2] = -v[10];
        this.olho[0] = c[0]; this.olho[1] = c[1]; this.olho[2] = c[2];
        // o céu calcula o raio de cada pixel com estes dois eixos
        var tanH = tanV * this.aspectoCamera;
        for (var e = 0; e < 3; e++) {
            this.ceuDireita[e] = this.direita[e] * tanH;
            this.ceuCima[e] = this.cima[e] * tanV;
        }
        this.temCamera = true;
    }

    // cores do céu, da luz e da névoa (pode ser chamado em todo quadro)
    defineAmbiente(amb) {
        if (!this.ok || !amb) {
            return;
        }
        var a = this.amb;
        if (amb.ceuTopo) { a.ceuTopo = this.rgb(amb.ceuTopo); }
        if (amb.ceuHorizonte) { a.ceuHorizonte = this.rgb(amb.ceuHorizonte); }
        if (amb.luz) { a.luz = this.rgb(amb.luz); }
        if (amb.ambiente) { a.ambiente = this.rgb(amb.ambiente); }
        if (amb.chaoLuz) { a.chaoLuz = this.rgb(amb.chaoLuz); }
        if (amb.nevoa) { a.nevoa = this.rgb(amb.nevoa); }
        if (typeof amb.nevoaInicio === "number") { a.nevoaInicio = amb.nevoaInicio; }
        if (typeof amb.nevoaFim === "number") { a.nevoaFim = amb.nevoaFim; }
        this.calculaNevoa();
        var d = amb.direcaoLuz;
        if (d && d.length >= 3) {
            this.defineDirecaoDaLuz(d);
        }
    }

    // põe uma malha na fila: mundo = posição + giro em Y da malha
    // branco (0 a 1) mistura a cor com branco (o pisca de quem leva tiro)
    malha(malha, x, y, z, rotY, branco) {
        if (!malha || !(malha.numVertices > 0)) {
            return;         // malha vazia (ou sem WebGL, quando toda malha é vazia)
        }
        var i = this.numMalhas;
        if (i >= LIMITE_MALHAS) {
            this.avisaExcesso("malhas", LIMITE_MALHAS);
            return;
        }
        var d = this.dadosMalhas;
        var k = i * 5;
        this.filaMalhas[i] = malha;
        d[k] = x || 0;
        d[k + 1] = y || 0;
        d[k + 2] = z || 0;
        d[k + 3] = rotY || 0;
        d[k + 4] = branco > 0 ? Math.min(branco, 1) : 0;
        this.numMalhas = i + 1;
    }

    // as caixas postas na fila depois disto ficam cortadas entre min e max em Z
    recorteZ(min, max) {
        this.recorteMin = min;
        this.recorteMax = max;
    }

    semRecorte() {
        this.recorteMin = -SEM_RECORTE;
        this.recorteMax = SEM_RECORTE;
    }

    // põe uma caixa na fila (x, y, z = canto mínimo; rotY gira em volta do centro)
    caixa(x, y, z, l, a, p, cor, material, rotY) {
        var fila = this.filaCaixas;
        var n = fila.quantidade;
        if (n >= LIMITE_CAIXAS) {
            this.avisaExcesso("caixas", LIMITE_CAIXAS);
            return;
        }
        // muitas caixas seguidas têm a mesma cor: nem consulta o Map
        if (cor !== this.ultimaCor) {
            this.trocaCor(cor);
        }
        var rgb = this.ultimoRgb;
        var d = fila.dados;
        var k = n * FLOATS_POR_CAIXA;
        d[k] = x; d[k + 1] = y; d[k + 2] = z;
        d[k + 3] = l; d[k + 4] = a; d[k + 5] = p;
        d[k + 6] = rgb[0]; d[k + 7] = rgb[1]; d[k + 8] = rgb[2];
        d[k + 9] = material || 0;
        d[k + 10] = rotY || 0;
        d[k + 11] = this.recorteMin;
        d[k + 12] = this.recorteMax;
        fila.quantidade = n + 1;
    }

    // a caixa trouxe outra cor: acha os números dela e guarda como a última
    trocaCor(cor) {
        this.ultimaCor = cor;
        this.ultimoRgb = this.rgb(cor);
    }

    // brilho somado à imagem, centrado em (x, y, z), de raio "tamanho"
    brilho(x, y, z, tamanho, cor, intensidade) {
        var fila = this.filaBrilhos;
        var n = fila.quantidade;
        if (n >= LIMITE_BRILHOS) {
            this.avisaExcesso("brilhos", LIMITE_BRILHOS);
            return;
        }
        var rgb = this.rgb(cor);
        var d = fila.dados;
        var k = n * FLOATS_POR_BRILHO;
        d[k] = x; d[k + 1] = y; d[k + 2] = z; d[k + 3] = tamanho;
        d[k + 4] = rgb[0]; d[k + 5] = rgb[1]; d[k + 6] = rgb[2];
        d[k + 7] = (intensidade === undefined) ? 1 : intensidade;
        fila.quantidade = n + 1;
    }

    // Sombra redonda no chão. Só aparece na qualidade baixa (ou se a placa
    // não conseguir fazer o mapa de sombra): nas outras o sol faz a sombra.
    sombraRedonda(x, z, raio, forca) {
        if (this.mapaSombra !== null) {
            return;
        }
        var fila = this.filaBolhas;
        var n = fila.quantidade;
        if (n >= LIMITE_BOLHAS) {
            this.avisaExcesso("sombras redondas", LIMITE_BOLHAS);
            return;
        }
        var d = fila.dados;
        var k = n * FLOATS_POR_BOLHA;
        d[k] = x; d[k + 1] = z; d[k + 2] = raio;
        d[k + 3] = (forca === undefined) ? 0.5 : forca;
        fila.quantidade = n + 1;
    }

    // desenha tudo o que foi para as filas neste quadro
    terminaQuadro() {
        if (!this.ok) {
            return;
        }
        this.medeTempo();
        if (this.perdido || this.gl.isContextLost()) {
            return;
        }
        // um erro aqui não pode parar o laço do jogo: avisa uma vez e segue
        try {
            this.renderiza();
        } catch (erro) {
            if (!this.avisos.erro) {
                this.avisaUmaVez("erro", "Pincel3D: erro ao desenhar: " + erro);
            }
        }
    }

    /* ----- utilidades ----- */

    // Onde o ponto (x, y, z) aparece no placar (0 a 900, 0 a 640), com a
    // câmera deste quadro. Escreve em "saida" (não cria objeto novo).
    projeta(x, y, z, saida) {
        if (!saida) {
            saida = { x: 0, y: 0, visivel: false };
        }
        if (!this.ok || !this.temCamera) {
            saida.x = 0;
            saida.y = 0;
            saida.visivel = false;
            return saida;
        }
        var m = this.vp;
        var cx = m[0] * x + m[4] * y + m[8] * z + m[12];
        var cy = m[1] * x + m[5] * y + m[9] * z + m[13];
        var cw = m[3] * x + m[7] * y + m[11] * z + m[15];
        if (cw <= 0.0001) {
            saida.visivel = false;      // atrás da câmera
            return saida;
        }
        saida.x = (cx / cw * 0.5 + 0.5) * this.larguraHud;
        saida.y = (0.5 - cy / cw * 0.5) * this.alturaHud;
        saida.visivel = true;
        return saida;
    }

    // "Fotografa" só uma malha, com fundo transparente, numa vista bonita de
    // três quartos (de frente, de lado e um pouco de cima). Usado uma vez,
    // no começo, para os retratos da página. Devolve um ImageData.
    fotografa(malha, largura, altura, rotY) {
        if (!this.ok || this.perdido || this.gl.isContextLost() || !malha || !malha.buffer || !(malha.numVertices > 0)) {
            return null;
        }
        var gl = this.gl;
        largura = Math.max(1, Math.round(largura || 1));
        altura = Math.max(1, Math.round(altura || 1));
        // desenha 3 vezes maior e depois reduz: as bordas ficam lisas
        var ss = 3;
        while (ss > 1 && (largura * ss > this.maxTamanho || altura * ss > this.maxTamanho)) {
            ss--;
        }
        var L = largura * ss, A = altura * ss;
        if (L > this.maxTamanho || A > this.maxTamanho) {
            return null;
        }

        // ----- quadro fora da tela (textura de cor + profundidade) -----
        var textura = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, textura);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, L, A, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.bindTexture(gl.TEXTURE_2D, null);
        var profundidade = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, profundidade);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, L, A);
        gl.bindRenderbuffer(gl.RENDERBUFFER, null);
        var quadro = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, quadro);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, textura, 0);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, profundidade);
        var imagem = null;

        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE) {
            // ----- câmera ajustada à malha -----
            // O enquadramento usa os vértices de verdade (girados): a caixa
            // que envolve a malha tem cantos vazios e deixaria a figura menor.
            var giro = rotY || 0;
            var cos = Math.cos(giro), sen = Math.sin(giro);
            var fonte = malha.dados;
            var total = fonte ? malha.numVertices : 8;
            var pontos = new Float32Array(total * 3);
            var mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
            for (var i = 0; i < total; i++) {
                var bx, by, bz;
                if (fonte) {
                    bx = fonte[i * FLOATS_POR_VERTICE];
                    by = fonte[i * FLOATS_POR_VERTICE + 1];
                    bz = fonte[i * FLOATS_POR_VERTICE + 2];
                } else {
                    bx = (i & 1) ? malha.max[0] : malha.min[0];
                    by = (i & 2) ? malha.max[1] : malha.min[1];
                    bz = (i & 4) ? malha.max[2] : malha.min[2];
                }
                pontos[i * 3] = bx * cos + bz * sen;
                pontos[i * 3 + 1] = by;
                pontos[i * 3 + 2] = bz * cos - bx * sen;
                for (var e = 0; e < 3; e++) {
                    mn[e] = Math.min(mn[e], pontos[i * 3 + e]);
                    mx[e] = Math.max(mx[e], pontos[i * 3 + e]);
                }
            }
            // A câmera fica na frente (+Z), um pouco acima e do lado para
            // onde a figura olha: o lado direito para quem olha para a
            // direita (a mira e o rosto aparecem) e o esquerdo no espelhado.
            var lado = (mn[0] + mx[0] >= 0) ? 1 : -1;
            var dx = lado * 0.62, dy = 0.4, dz = 1;
            var t = 1 / Math.sqrt(dx * dx + dy * dy + dz * dz);
            dx *= t; dy *= t; dz *= t;
            // eixos da câmera: direita = frente x cima, cima = direita x frente
            // (a frente é -d, porque d aponta do alvo para o olho)
            var rx = dz, rz = -dx;
            t = 1 / Math.sqrt(rx * rx + rz * rz);
            rx *= t; rz *= t;
            var ux = rz * dy, uy = rx * dz - rz * dx, uz = -rx * dy;
            var fov = 28 * Math.PI / 180;
            var tanV = Math.tan(fov / 2), tanH = tanV * L / A;
            var alvo = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2];
            var distancia = 1;
            // Três voltas: acha a distância em que a figura ocupa 90% da
            // altura (e cabe na largura) e centraliza o que a perspectiva
            // deslocou; cada volta chega mais perto do enquadramento certo.
            for (var volta = 0; volta < 3; volta++) {
                distancia = 1;
                for (i = 0; i < total; i++) {
                    var qx = pontos[i * 3] - alvo[0], qy = pontos[i * 3 + 1] - alvo[1], qz = pontos[i * 3 + 2] - alvo[2];
                    var cX = qx * rx + qz * rz, cY = qx * ux + qy * uy + qz * uz, cZ = qx * dx + qy * dy + qz * dz;
                    distancia = Math.max(distancia, cZ + Math.abs(cY) / (tanV * 0.9), cZ + Math.abs(cX) / (tanH * 0.94));
                }
                var nyMin = Infinity, nyMax = -Infinity, nxMin = Infinity, nxMax = -Infinity;
                for (i = 0; i < total; i++) {
                    var sx = pontos[i * 3] - alvo[0], sy = pontos[i * 3 + 1] - alvo[1], sz = pontos[i * 3 + 2] - alvo[2];
                    var pX = sx * rx + sz * rz, pY = sx * ux + sy * uy + sz * uz;
                    var w = distancia - (sx * dx + sy * dy + sz * dz);
                    nyMin = Math.min(nyMin, pY / w / tanV);
                    nyMax = Math.max(nyMax, pY / w / tanV);
                    nxMin = Math.min(nxMin, pX / w / tanH);
                    nxMax = Math.max(nxMax, pX / w / tanH);
                }
                var meioY = (nyMin + nyMax) / 2 * tanV * distancia;
                var meioX = (nxMin + nxMax) / 2 * tanH * distancia;
                alvo[0] += rx * meioX + ux * meioY;
                alvo[1] += uy * meioY;
                alvo[2] += rz * meioX + uz * meioY;
            }
            var raio = Math.sqrt((mx[0] - mn[0]) * (mx[0] - mn[0]) + (mx[1] - mn[1]) * (mx[1] - mn[1]) +
                (mx[2] - mn[2]) * (mx[2] - mn[2])) / 2;
            var olho = [alvo[0] + dx * distancia, alvo[1] + dy * distancia, alvo[2] + dz * distancia];
            var vista = matrizOlhaPara(new Float32Array(16), [olho[0], olho[1], olho[2], alvo[0], alvo[1], alvo[2]]);
            var proj = matrizPerspectiva(new Float32Array(16), fov, L / A,
                Math.max(0.5, distancia - raio * 1.6), distancia + raio * 1.6);
            var vp = matrizMultiplica(new Float32Array(16), proj, vista);

            // ----- desenho, com uma luz fixa de estúdio -----
            gl.viewport(0, 0, L, A);
            gl.clearColor(0, 0, 0, 0);
            gl.depthMask(true);
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            gl.enable(gl.DEPTH_TEST);
            gl.depthFunc(gl.LESS);
            gl.enable(gl.CULL_FACE);
            gl.cullFace(gl.BACK);
            gl.disable(gl.BLEND);
            var p = this.progMalha[0];
            var u = p.u;
            this.usaPrograma(p);
            this.usaAtributos(ATRIB_MALHA);
            gl.uniformMatrix4fv(u.uVP, false, vp);
            gl.uniform3f(u.uOlho, olho[0], olho[1], olho[2]);
            var lx = -lado * 0.35, ly = 0.85, lz = 0.6;
            t = 1 / Math.sqrt(lx * lx + ly * ly + lz * lz);
            gl.uniform3f(u.uParaLuz, lx * t, ly * t, lz * t);
            gl.uniform3f(u.uLuzCor, 1.0, 0.95, 0.86);
            gl.uniform3f(u.uAmbiente, 0.56, 0.58, 0.78);
            gl.uniform3f(u.uChaoLuz, 0.36, 0.29, 0.26);
            gl.uniform3f(u.uNevoaCor, 0, 0, 0);
            gl.uniform2f(u.uNevoa, 1e9, 1e-9);          // sem névoa
            gl.uniform1f(u.uPixelMundo, 2 * tanV / A);
            gl.uniform1f(u.uBranco, 0);
            gl.uniform4f(u.uTransforma, 0, 0, 0, giro);
            this.desenhaMalhaCrua(malha, true);

            // ----- lê os pixels, reduz 3 x 3 -> 1 e desvira as linhas -----
            // (o WebGL entrega as linhas de baixo para cima)
            var pixels = new Uint8Array(L * A * 4);
            gl.readPixels(0, 0, L, A, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
            imagem = new ImageData(largura, altura);
            var saida = imagem.data;
            var area = ss * ss;
            for (var y = 0; y < altura; y++) {
                for (var x = 0; x < largura; x++) {
                    var somaR = 0, somaG = 0, somaB = 0, somaA = 0;
                    for (var j = 0; j < ss; j++) {
                        var linha = A - 1 - (y * ss + j);
                        for (var ii = 0; ii < ss; ii++) {
                            var o = (linha * L + x * ss + ii) * 4;
                            var alfa = pixels[o + 3];
                            somaR += pixels[o] * alfa;
                            somaG += pixels[o + 1] * alfa;
                            somaB += pixels[o + 2] * alfa;
                            somaA += alfa;
                        }
                    }
                    var s = (y * largura + x) * 4;
                    if (somaA > 0) {
                        saida[s] = somaR / somaA;
                        saida[s + 1] = somaG / somaA;
                        saida[s + 2] = somaB / somaA;
                        saida[s + 3] = somaA / area;
                    }
                }
            }
        }

        // ----- devolve o estado de antes -----
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.deleteFramebuffer(quadro);
        gl.deleteRenderbuffer(profundidade);
        gl.deleteTexture(textura);
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        gl.clearColor(0, 0, 0, 1);
        return imagem;
    }

    /* ----- métodos internos ----- */

    // Prepara (ou refaz, depois de um contexto perdido) tudo o que fica na
    // placa de vídeo. Devolve false se não der para usar o 3D.
    iniciaGL() {
        var gl = this.gl;
        var este = this;
        this.programaAtual = null;
        this.atributosAtivos = 0;
        this.mapaSombra = null;
        this.cronometro = null;
        if (gl.isContextLost()) {
            return false;
        }

        // ----- desenho de várias cópias de uma vez (instancing) -----
        // No WebGL 2 já vem pronto; no WebGL 1 é uma extensão quase universal.
        if (this.webgl2) {
            this.divisor = gl.vertexAttribDivisor.bind(gl);
            this.desenhaElementosInstancias = gl.drawElementsInstanced.bind(gl);
            this.desenhaVerticesInstancias = gl.drawArraysInstanced.bind(gl);
        } else {
            var ext = gl.getExtension("ANGLE_instanced_arrays");
            if (!ext) {
                console.warn("Pincel3D: falta a extensão ANGLE_instanced_arrays.");
                return false;
            }
            this.divisor = ext.vertexAttribDivisorANGLE.bind(ext);
            this.desenhaElementosInstancias = ext.drawElementsInstancedANGLE.bind(ext);
            this.desenhaVerticesInstancias = ext.drawArraysInstancedANGLE.bind(ext);
        }

        // ----- limites da placa -----
        this.maxTamanho = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), gl.getParameter(gl.MAX_RENDERBUFFER_SIZE));
        var tela = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
        if (!tela) {
            return false;   // contexto perdido bem agora
        }
        this.maxTela = Math.min(tela[0], tela[1], this.maxTamanho);
        // o mapa de sombra precisa de números de alta precisão no shader
        var precisao = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
        this.sombraPossivel = !!precisao && precisao.precision > 0;

        // ----- programas (todas as variações já no começo) -----
        this.progMalha = [
            this.criaPrograma(GLSL_MALHA_VERTICE, GLSL_CENA_FRAGMENTO, ""),
            this.criaPrograma(GLSL_MALHA_VERTICE, GLSL_CENA_FRAGMENTO, "#define SOMBRA\n")
        ];
        this.progCaixa = [
            this.criaPrograma(GLSL_CAIXA_VERTICE, GLSL_CENA_FRAGMENTO, ""),
            this.criaPrograma(GLSL_CAIXA_VERTICE, GLSL_CENA_FRAGMENTO, "#define SOMBRA\n")
        ];
        this.progSombraMalha = this.criaPrograma(GLSL_SOMBRA_MALHA_VERTICE, GLSL_SOMBRA_FRAGMENTO, "");
        this.progSombraCaixa = this.criaPrograma(GLSL_SOMBRA_CAIXA_VERTICE, GLSL_SOMBRA_FRAGMENTO, "");
        this.progCeu = this.criaPrograma(GLSL_CEU_VERTICE, GLSL_CEU_FRAGMENTO, "");
        this.progBrilho = this.criaPrograma(GLSL_BRILHO_VERTICE, GLSL_BRILHO_FRAGMENTO, "");
        this.progBolha = this.criaPrograma(GLSL_BOLHA_VERTICE, GLSL_BOLHA_FRAGMENTO, "");
        if (!this.progMalha[0] || !this.progMalha[1] || !this.progCaixa[0] || !this.progCaixa[1] ||
            !this.progSombraMalha || !this.progSombraCaixa || !this.progCeu || !this.progBrilho || !this.progBolha) {
            return false;
        }

        // ----- geometria fixa -----
        // cubo de lado 1 (24 vértices: posição + normal) e seus 36 índices
        var cubo = new Float32Array(24 * 6);
        var indices = new Uint16Array(36);
        for (var f = 0; f < 6; f++) {
            var face = FACES_DO_CUBO[f];
            for (var c = 0; c < 4; c++) {
                var a = CANTOS_DA_FACE[c][0], b = CANTOS_DA_FACE[c][1];
                var k = (f * 4 + c) * 6;
                for (var e = 0; e < 3; e++) {
                    cubo[k + e] = (face.n[e] > 0 ? 1 : 0) + a * face.u[e] + b * face.v[e];
                    cubo[k + 3 + e] = face.n[e];
                }
            }
            indices.set([f * 4, f * 4 + 1, f * 4 + 2, f * 4, f * 4 + 2, f * 4 + 3], f * 6);
        }
        this.bufferCubo = this.criaBuffer(gl.ARRAY_BUFFER, cubo, gl.STATIC_DRAW);
        this.indicesCubo = this.criaBuffer(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
        // quadrado dos brilhos e das sombras redondas (tira de 2 triângulos)
        this.bufferQuadrado = this.criaBuffer(gl.ARRAY_BUFFER,
            new Float32Array([-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0]), gl.STATIC_DRAW);
        // triângulo que cobre a tela toda (céu)
        this.bufferCeu = this.criaBuffer(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        // buffers das filas, já com o tamanho máximo
        this.preparaFila(this.filaCaixas);
        this.preparaFila(this.filaBrilhos);
        this.preparaFila(this.filaBolhas);

        // os atributos 4 a 7 são sempre "por instância" (um valor por caixa)
        for (var i = 4; i < 8; i++) {
            this.divisor(i, 1);
        }
        gl.frontFace(gl.CCW);

        this.preparaCronometro();

        // manda de novo as malhas que já existiam (contexto recuperado)
        this.malhas.forEach(function (malha) {
            este.enviaMalha(malha);
        });

        this.aplicaQualidade();
        return true;
    }

    // Contexto perdido: tudo o que estava na placa de vídeo sumiu junto. As
    // referências velhas são esquecidas para nada tentar usar (ou apagar)
    // um objeto de um contexto que não existe mais; a volta (iniciaGL) cria
    // tudo de novo, inclusive os buffers das malhas, a partir da cópia.
    esqueceGL() {
        this.malhas.forEach(function (malha) {
            malha.buffer = null;
        });
        this.mapaSombra = null;
        this.cronometro = null;
        this.programaAtual = null;
        this.atributosAtivos = 0;
        this.filaCaixas.buffer = null;
        this.filaBrilhos.buffer = null;
        this.filaBolhas.buffer = null;
    }

    // compila os dois shaders e liga os dois num programa
    criaPrograma(fonteVertice, fonteFragmento, prefixo) {
        var gl = this.gl;
        var vs = this.compila(gl.VERTEX_SHADER, prefixo + fonteVertice);
        var fs = this.compila(gl.FRAGMENT_SHADER, prefixo + fonteFragmento);
        if (!vs || !fs) {
            return null;
        }
        var programa = gl.createProgram();
        gl.attachShader(programa, vs);
        gl.attachShader(programa, fs);
        for (var nome in LOCAL_DOS_ATRIBUTOS) {
            gl.bindAttribLocation(programa, LOCAL_DOS_ATRIBUTOS[nome], nome);
        }
        gl.linkProgram(programa);
        gl.deleteShader(vs);
        gl.deleteShader(fs);
        if (!gl.getProgramParameter(programa, gl.LINK_STATUS) && !gl.isContextLost()) {
            console.error("Pincel3D: erro ao ligar o programa:", gl.getProgramInfoLog(programa));
            return null;
        }
        // guarda onde fica cada uniform (null quando o programa não usa)
        var u = {};
        for (var i = 0; i < NOMES_DOS_UNIFORMS.length; i++) {
            u[NOMES_DOS_UNIFORMS[i]] = gl.getUniformLocation(programa, NOMES_DOS_UNIFORMS[i]);
        }
        return { programa: programa, u: u };
    }

    compila(tipo, fonte) {
        var gl = this.gl;
        var shader = gl.createShader(tipo);
        gl.shaderSource(shader, fonte);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) && !gl.isContextLost()) {
            console.error("Pincel3D: erro no shader:", gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }
        return shader;
    }

    criaBuffer(alvo, dados, uso) {
        var gl = this.gl;
        var buffer = gl.createBuffer();
        gl.bindBuffer(alvo, buffer);
        gl.bufferData(alvo, dados, uso);
        return buffer;
    }

    // fila de instâncias: dados na memória + buffer na placa de vídeo
    criaFila(capacidade, floats) {
        var grupos = Math.ceil(capacidade / 64) + 1;
        var vistas = [];
        for (var i = 0; i < grupos; i++) {
            vistas.push(null);
        }
        return {
            dados: new Float32Array(capacidade * floats), floats: floats, capacidade: capacidade,
            quantidade: 0, buffer: null, vistas: vistas
        };
    }

    preparaFila(fila) {
        var gl = this.gl;
        fila.buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, fila.buffer);
        gl.bufferData(gl.ARRAY_BUFFER, fila.dados.byteLength, gl.DYNAMIC_DRAW);
    }

    // manda para a placa só a parte usada da fila
    enviaFila(fila) {
        var gl = this.gl;
        var n = fila.quantidade;
        if (n === 0) {
            return;
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, fila.buffer);
        if (this.webgl2) {
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, fila.dados, 0, n * fila.floats);
        } else {
            // O WebGL 1 só envia vetores inteiros. Para não criar um pedaço
            // novo a cada quadro, os pedaços (de 64 em 64 instâncias) são
            // criados uma vez só e guardados.
            var grupo = Math.ceil(n / 64);
            var vista = fila.vistas[grupo];
            if (vista === null) {
                vista = fila.dados.subarray(0, Math.min(grupo * 64, fila.capacidade) * fila.floats);
                fila.vistas[grupo] = vista;
            }
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, vista);
        }
    }

    registraMalha(malha) {
        if (malha.numVertices > 0) {
            this.malhas.add(malha);
            if (!this.perdido) {
                this.enviaMalha(malha);
            }
        }
        return malha;
    }

    enviaMalha(malha) {
        if (malha.dados && malha.numVertices > 0) {
            malha.buffer = this.criaBuffer(this.gl.ARRAY_BUFFER, malha.dados, this.gl.STATIC_DRAW);
        }
    }

    // "#rrggbb" -> [r, g, b] de 0 a 1, guardado num Map para não converter de
    // novo. A conversão fica num método separado: este, que roda toda hora,
    // fica bem pequeno.
    rgb(hex) {
        var cor = this.cores.get(hex);
        return cor !== undefined ? cor : this.converteCor(hex);
    }

    converteCor(hex) {
        var texto = String(hex);
        if (texto[0] === "#") {
            texto = texto.slice(1);
        }
        if (texto.length === 3) {
            texto = texto[0] + texto[0] + texto[1] + texto[1] + texto[2] + texto[2];
        }
        var n = parseInt(texto, 16);
        if (texto.length !== 6 || isNaN(n)) {
            this.avisaUmaVez("cor", "Pincel3D: cor inválida: " + hex);
            n = 0xff00ff;       // magenta: fácil de achar o erro na tela
        }
        if (this.cores.size > 4096) {
            this.cores.clear();
        }
        var cor = new Float32Array([((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]);
        this.cores.set(hex, cor);
        return cor;
    }

    avisaUmaVez(chave, texto) {
        if (!this.avisos[chave]) {
            this.avisos[chave] = true;
            console.warn(texto);
        }
    }

    // aviso de fila cheia: o texto só é montado na primeira vez (depois
    // disso, cada item que sobra custa só uma consulta, sem criar texto)
    avisaExcesso(nome, limite) {
        if (!this.avisos[nome]) {
            this.avisos[nome] = true;
            console.warn("Pincel3D: mais de " + limite + " " + nome + " neste quadro; as que sobraram foram ignoradas.");
        }
    }

    // proporção (largura / altura) da imagem na tela
    medeAspecto() {
        if (this.cssLargura > 0 && this.cssAltura > 0) {
            this.aspectoCamera = this.cssLargura / this.cssAltura;
        } else if (this.canvas && this.canvas.width > 0 && this.canvas.height > 0) {
            this.aspectoCamera = this.canvas.width / this.canvas.height;
        } else {
            this.aspectoCamera = this.larguraHud / this.alturaHud;
        }
    }

    // névoa linear: o shader recebe o início e 1 / (fim - início)
    calculaNevoa() {
        var a = this.amb;
        this.nevoaParams[0] = a.nevoaInicio;
        this.nevoaParams[1] = 1 / Math.max(a.nevoaFim - a.nevoaInicio, 1);
    }

    // ----- sol e mapa de sombra -----

    // d = [x, y, z], para onde a luz do sol anda
    defineDirecaoDaLuz(d) {
        // O jogo manda o mesmo vetor em todo quadro: sendo o mesmo objeto da
        // última vez, nem os números são lidos (um vetor mudado no lugar não
        // é percebido; para mudar a luz, mande outro vetor). Um vetor novo é
        // comparado com o pedido anterior (antes de normalizar) e as contas
        // só são refeitas se a direção mudou de verdade.
        if (d === this.vetorLuz) {
            return;
        }
        this.vetorLuz = d;
        var x = d[0], y = d[1], z = d[2];
        var pedido = this.luzPedida;
        if (x === pedido[0] && y === pedido[1] && z === pedido[2]) {
            return;
        }
        var tam = Math.sqrt(x * x + y * y + z * z);
        if (!(tam > 0)) {
            return;
        }
        pedido[0] = x; pedido[1] = y; pedido[2] = z;
        x /= tam; y /= tam; z /= tam;
        var d = this.dirLuz;
        d[0] = x; d[1] = y; d[2] = z;
        this.paraLuz[0] = -x; this.paraLuz[1] = -y; this.paraLuz[2] = -z;

        // O sol "olha" para o centro da caixa da luz. A projeção ortográfica
        // é a menor que ainda cobre os 8 cantos da caixa vistos do sol.
        var b = CAIXA_DA_LUZ;
        var cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2, cz = (b.z0 + b.z1) / 2;
        var p = this.pontosLuz;
        p[0] = cx - x * 2000; p[1] = cy - y * 2000; p[2] = cz - z * 2000;
        p[3] = cx; p[4] = cy; p[5] = cz;
        matrizOlhaPara(this.vistaLuz, p);
        var v = this.vistaLuz;
        var minX = Infinity, minY = Infinity, minZ = Infinity;
        var maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
        for (var i = 0; i < 8; i++) {
            var px = (i & 1) ? b.x1 : b.x0, py = (i & 2) ? b.y1 : b.y0, pz = (i & 4) ? b.z1 : b.z0;
            var lx = v[0] * px + v[4] * py + v[8] * pz + v[12];
            var ly = v[1] * px + v[5] * py + v[9] * pz + v[13];
            var lz = v[2] * px + v[6] * py + v[10] * pz + v[14];
            minX = Math.min(minX, lx); maxX = Math.max(maxX, lx);
            minY = Math.min(minY, ly); maxY = Math.max(maxY, ly);
            minZ = Math.min(minZ, lz); maxZ = Math.max(maxZ, lz);
        }
        // a câmera do sol olha para -Z; o "perto" vai um pouco além da
        // caixa, para uma placa alta ainda fazer sombra lá dentro
        var perto = -maxZ - 300, longe = -minZ;
        matrizOrtografica(this.projecaoLuz, minX, maxX, minY, maxY, perto, longe);
        matrizMultiplica(this.luzVP, this.projecaoLuz, this.vistaLuz);
        this.larguraLuz = Math.max(maxX - minX, maxY - minY);
        // viés de meia unidade do mundo, na escala de profundidade de 0 a 1
        this.viesLuz = 0.5 / (longe - perto);
    }

    // liga ou desliga o mapa de sombra conforme a qualidade
    aplicaQualidade() {
        var tamanho = 0;
        if (this.nivel === "alta") { tamanho = 2048; }
        if (this.nivel === "media") { tamanho = 1024; }
        if (!this.sombraPossivel) { tamanho = 0; }
        tamanho = Math.min(tamanho, this.maxTamanho);
        if (this.mapaSombra && this.mapaSombra.tamanho === tamanho) {
            return;
        }
        this.liberaMapaDeSombra();
        if (tamanho > 0) {
            this.mapaSombra = this.criaMapaDeSombra(tamanho);
        }
    }

    // O mapa de sombra é uma imagem do mundo vista do sol, onde cada pixel
    // guarda a distância até a primeira coisa que a luz encontra.
    criaMapaDeSombra(tamanho) {
        var gl = this.gl;
        var textura = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, textura);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, tamanho, tamanho, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        // NEAREST: a profundidade está "picada" em 4 bytes e não pode ser misturada
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.bindTexture(gl.TEXTURE_2D, null);
        var profundidade = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, profundidade);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, tamanho, tamanho);
        gl.bindRenderbuffer(gl.RENDERBUFFER, null);
        var quadro = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, quadro);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, textura, 0);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, profundidade);
        var completo = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        if (!completo) {
            // sem mapa de sombra, o jogo usa as sombras redondas
            gl.deleteFramebuffer(quadro);
            gl.deleteRenderbuffer(profundidade);
            gl.deleteTexture(textura);
            this.avisaUmaVez("sombra", "Pincel3D: a placa não fez o mapa de sombra; usando sombras redondas.");
            return null;
        }
        return { tamanho: tamanho, textura: textura, profundidade: profundidade, quadro: quadro };
    }

    liberaMapaDeSombra() {
        var m = this.mapaSombra;
        if (m) {
            this.gl.deleteFramebuffer(m.quadro);
            this.gl.deleteRenderbuffer(m.profundidade);
            this.gl.deleteTexture(m.textura);
        }
        this.mapaSombra = null;
    }

    // ----- resolução dinâmica -----
    // A lógica do jogo roda sempre a 60 passos por segundo, então a meta é
    // desenhar 60 quadros por segundo. Passar disso (monitores de 120, 144
    // ou 180 Hz) é bônus: nunca vale perder nitidez por ele. Por isso a
    // conta usa números fixos, e não "o melhor tempo já visto", que num
    // monitor rápido fazia qualquer quadro normal parecer lento.
    //
    // Os intervalos entre os quadros são juntados em janelas de meio
    // segundo. No fim de cada janela sai uma média sem os 10% de quadros
    // mais lentos (uma travada sozinha não conta) e a decisão tem folga dos
    // dois lados, para a escala não ficar indo e voltando:
    //   - abaixo de 52 quadros por segundo em duas janelas seguidas, desce
    //     um degrau (dois, se estiver bem lento);
    //   - entre 52 e 57 nada muda;
    //   - acima de 57 por um tempo, tenta subir um degrau. Se o degrau novo
    //     não segurar 55, volta e espera o dobro para tentar de novo (3 s,
    //     6 s, 12 s... até 1 minuto).
    // Se três degraus abaixo o jogo não ficou mais rápido, quem segura o
    // ritmo não é a placa de vídeo (é o monitor, o processador ou o modo de
    // economia de bateria): a escala volta para onde estava e fica um tempo
    // sem descer. Intervalos acima de 250 ms são pausas (aba escondida,
    // palco fora da tela) e só recomeçam a janela. Depois de cada troca, os
    // primeiros quadros são ignorados até o navegador assentar o tamanho novo.
    // Quando dá para medir o tempo da própria placa (veja preparaCronometro),
    // essa medida só serve para subir mais cedo.
    medeTempo() {
        var agora = performance.now();
        var dt = this.ultimoQuadro >= 0 ? agora - this.ultimoQuadro : -1;
        this.ultimoQuadro = agora;
        if (!(dt > 0) || dt > PAUSA_MS) {
            this.zeraJanela(ASSENTA_MS);
            return;
        }
        if (this.espera > 0) {
            this.espera -= dt;
            return;
        }
        if (this.bloqueioDescida > 0) {
            this.bloqueioDescida -= dt;
        }
        if (this.provaSubida > 0) {
            this.provaSubida -= dt;
        }
        this.tempos[this.numTempos] = dt;
        this.numTempos++;
        this.duracaoJanela += dt;
        if ((this.duracaoJanela >= JANELA_MS && this.numTempos >= 8) || this.numTempos === this.tempos.length) {
            this.fechaJanela();
        }
    }

    // fim de uma janela: a média sem os quadros mais lentos vira "quadros
    // por segundo", que decide se a escala desce, fica ou sobe
    fechaJanela() {
        var t = this.tempos;
        var n = this.numTempos;
        // ordena os intervalos (são poucos: inserção simples, sem criar nada)
        for (var i = 1; i < n; i++) {
            var v = t[i];
            var j = i - 1;
            while (j >= 0 && t[j] > v) {
                t[j + 1] = t[j];
                j--;
            }
            t[j + 1] = v;
        }
        var usados = n - Math.floor(n / 10);
        var soma = 0;
        for (i = 0; i < usados; i++) {
            soma += t[i];
        }
        var duracao = this.duracaoJanela;
        var placaMs = this.numPlaca >= 4 ? this.somaPlaca / this.numPlaca : -1;
        this.zeraJanela(0);
        this.decideEscala(1000 * usados / soma, duracao, placaMs);
    }

    // fps: quadros por segundo da janela; placaMs: quanto a placa de vídeo
    // gastou em cada quadro, em média (-1 quando o navegador não deixa medir)
    decideEscala(fps, duracao, placaMs) {
        var ultimo = DEGRAUS_DA_ESCALA.length - 1;
        // 1. o degrau que acabou de subir precisa segurar o ritmo
        if (this.provaSubida > 0) {
            if (fps < FPS_PROVA) {
                this.provaSubida = 0;
                this.provando = false;
                this.esperaSubida = Math.min(this.esperaSubida * 2, ESPERA_SUBIDA_MAX_MS);
                if (this.subiuPelaPlaca) {
                    this.placaConfiavel = false;    // a medida da placa errou: não serve mais para subir
                }
                this.mudaDegrau(this.degrau + 1);
                return;
            }
        } else if (this.provando) {
            this.provando = false;
            this.esperaSubida = ESPERA_SUBIDA_MS;       // passou na prova
        }
        // 2. lento de verdade: desce. (O tempo medido pela placa não impede a
        // descida: em algumas placas essa medida mente para menos, e aí uma
        // placa lenta de verdade nunca desceria.)
        this.janelasLentas = fps < FPS_LENTO ? this.janelasLentas + 1 : 0;
        if (this.descendo) {
            this.tempoRapido = fps >= FPS_PROVA ? this.tempoRapido + duracao : 0;
            if (this.tempoRapido >= SUCESSO_MS) {
                this.descendo = false;                  // achou o degrau certo
            }
        }
        if (this.janelasLentas >= 2 && this.bloqueioDescida <= 0) {
            if (!this.descendo) {
                this.descendo = true;
                this.degrauAntesDaDescida = this.degrau;
                this.fpsAntesDaDescida = fps;
                this.degrauDoPatamar = this.degrau;
                this.fpsDoPatamar = fps;
            } else if ((this.degrau - this.degrauAntesDaDescida >= 3 || this.degrau === ultimo) &&
                fps < this.fpsAntesDaDescida * 1.1) {
                // descer não adiantou: volta e fica um tempo sem tentar
                this.descendo = false;
                this.bloqueioDescida = this.esperaBloqueio;
                this.esperaBloqueio = Math.min(this.esperaBloqueio * 2, BLOQUEIO_MAX_MS);
                this.mudaDegrau(this.degrauAntesDaDescida);
                return;
            } else if (this.fpsDoPatamar >= this.fpsAntesDaDescida * 1.1 &&
                Math.abs(fps - this.fpsDoPatamar) < this.fpsDoPatamar * 0.05) {
                // A descida ajudou até o degrau do patamar, mas dali para baixo
                // não ganhou nada: o ritmo bateu num limite que não é da placa
                // (monitor de 50 Hz, economia de bateria a 30 quadros por
                // segundo). Sem isso a escala ia até 0.5 e ficava lá. Com dois
                // degraus assim (um só pode ser o vsync arredondando), ou no
                // último, volta para o degrau do patamar.
                var semGanho = this.degrau - this.degrauDoPatamar;
                if (semGanho >= 2 || (semGanho >= 1 && this.degrau === ultimo)) {
                    this.descendo = false;
                    this.bloqueioDescida = this.esperaBloqueio;
                    this.esperaBloqueio = Math.min(this.esperaBloqueio * 2, BLOQUEIO_MAX_MS);
                    this.mudaDegrau(this.degrauDoPatamar);
                    return;
                }
            } else {
                // o ritmo ainda mudou com a descida: este é o novo patamar
                this.degrauDoPatamar = this.degrau;
                this.fpsDoPatamar = fps;
            }
            if (this.degrau < ultimo) {
                this.mudaDegrau(Math.min(this.degrau + (fps < 36 ? 2 : 1), ultimo));
            }
            return;
        }
        // 3. com folga: sobe. Sobe logo se a placa mediu que o degrau de cima
        // ainda cabe com sobra (até a primeira vez que essa conta errar) ou
        // se a folga for grande, como num monitor rápido (só enquanto nenhuma
        // subida falhou). Fora isso vale a espera que dobra a cada falha:
        // assim a escala não fica subindo e descendo.
        if (this.degrau > 0 && !this.provando && !this.descendo && fps >= FPS_FOLGA) {
            this.tempoFolgado += duracao;
            var cresce = DEGRAUS_DA_ESCALA[this.degrau - 1] / this.fatorEscala;
            var cabe = this.placaConfiavel && placaMs >= 0 && placaMs * cresce * cresce < ORCAMENTO_MS * 0.6;
            var depressa = cabe || (fps >= FPS_SOBRA && this.esperaSubida === ESPERA_SUBIDA_MS);
            if (this.tempoFolgado >= (depressa ? JANELA_MS : this.esperaSubida)) {
                this.provando = true;
                this.provaSubida = PROVA_MS;
                this.subiuPelaPlaca = cabe;
                this.mudaDegrau(this.degrau - 1);
            }
        } else {
            this.tempoFolgado = 0;
        }
    }

    mudaDegrau(degrau) {
        this.degrau = degrau;
        this.fatorEscala = DEGRAUS_DA_ESCALA[degrau];
        this.janelasLentas = 0;
        this.tempoFolgado = 0;
        this.tempoRapido = 0;
        this.zeraJanela(ASSENTA_MS);
    }

    zeraJanela(espera) {
        this.numTempos = 0;
        this.duracaoJanela = 0;
        this.somaPlaca = 0;
        this.numPlaca = 0;
        this.espera = espera;
    }

    // A imagem mudou de tamanho (janela, tela cheia): o custo de cada quadro
    // mudou junto, então as esperas da resolução dinâmica recomeçam.
    tamanhoMudou() {
        this.esperaSubida = ESPERA_SUBIDA_MS;
        this.bloqueioDescida = 0;
        this.esperaBloqueio = BLOQUEIO_MS;
        // uma descida aberta compararia o ritmo novo com o do tamanho antigo
        this.descendo = false;
        this.janelasLentas = 0;
        this.tempoRapido = 0;
        this.tempoFolgado = 0;
        this.zeraJanela(ASSENTA_MS);
    }

    // volta a resolução dinâmica para o começo (escala 1, nada medido)
    zeraResolucao() {
        this.degrau = 0;
        this.fatorEscala = 1;
        this.janelasLentas = 0;
        this.tempoFolgado = 0;
        this.tempoRapido = 0;
        this.esperaSubida = ESPERA_SUBIDA_MS;
        this.provaSubida = 0;
        this.provando = false;
        this.subiuPelaPlaca = false;
        this.placaConfiavel = true;
        this.descendo = false;
        this.degrauAntesDaDescida = 0;
        this.fpsAntesDaDescida = 0;
        this.degrauDoPatamar = 0;
        this.fpsDoPatamar = 0;
        this.bloqueioDescida = 0;
        this.esperaBloqueio = BLOQUEIO_MS;
        this.zeraJanela(ASSENTA_MS);
    }

    // Acerta o tamanho da imagem: tamanho na tela x pixels por pixel x
    // escala dinâmica. Só mexe no canvas quando o tamanho muda de verdade
    // (mudar o tamanho apaga e realoca a imagem).
    ajustaTamanho() {
        var canvas = this.canvas;
        if (!this.observador && (canvas.clientWidth !== this.cssLargura || canvas.clientHeight !== this.cssAltura)) {
            this.cssLargura = canvas.clientWidth;
            this.cssAltura = canvas.clientHeight;
            this.tamanhoMudou();
        }
        if (!(this.cssLargura > 0 && this.cssAltura > 0)) {
            return false;       // canvas escondido: nada para desenhar
        }
        var dpr = this.densidadeVigiada ? this.densidade : (window.devicePixelRatio || 1);
        var razao = 0.75;
        if (this.nivel === "alta") { razao = Math.min(dpr, 2); }
        if (this.nivel === "media") { razao = Math.min(dpr, 1); }
        var largura = Math.max(1, Math.min(Math.round(this.cssLargura * razao * this.fatorEscala), this.maxTela));
        var altura = Math.max(1, Math.min(Math.round(this.cssAltura * razao * this.fatorEscala), this.maxTela));
        if (canvas.width !== largura) { canvas.width = largura; }
        if (canvas.height !== altura) { canvas.height = altura; }
        return true;
    }

    // A densidade de pixels da tela (devicePixelRatio) quase nunca muda: só
    // com o zoom do navegador ou levando a janela para outro monitor. Ler o
    // valor a cada quadro criaria um número novo na memória quando ele é
    // quebrado (1.25, 1.5...), então ele é lido uma vez e de novo só quando o
    // navegador avisa que mudou. Sem esse aviso, é lido a cada quadro.
    vigiaDensidade() {
        var este = this;
        this.densidade = window.devicePixelRatio || 1;
        this.densidadeVigiada = false;
        if (typeof window.matchMedia !== "function") {
            return;
        }
        var consulta = window.matchMedia("(resolution: " + this.densidade + "dppx)");
        if (!consulta || !consulta.matches) {
            return;         // navegador que não entende essa consulta
        }
        var mudou = function () {
            if (consulta.removeEventListener) {
                consulta.removeEventListener("change", mudou);
            } else {
                consulta.removeListener(mudou);
            }
            este.vigiaDensidade();
            este.tamanhoMudou();        // outra densidade: outro número de pixels
        };
        if (consulta.addEventListener) {
            consulta.addEventListener("change", mudou);
        } else if (consulta.addListener) {
            consulta.addListener(mudou);
        } else {
            return;
        }
        this.densidadeVigiada = true;
    }

    usaPrograma(p) {
        if (this.programaAtual !== p) {
            this.gl.useProgram(p.programa);
            this.programaAtual = p;
        }
    }

    // liga só os atributos que o programa usa (cada bit é um atributo)
    usaAtributos(mascara) {
        var atual = this.atributosAtivos;
        if (atual === mascara) {
            return;
        }
        for (var i = 0; i < 8; i++) {
            var bit = 1 << i;
            if ((mascara & bit) && !(atual & bit)) {
                this.gl.enableVertexAttribArray(i);
            } else if (!(mascara & bit) && (atual & bit)) {
                this.gl.disableVertexAttribArray(i);
            }
        }
        this.atributosAtivos = mascara;
    }

    desenhaMalhaCrua(malha, completa) {
        var gl = this.gl;
        gl.bindBuffer(gl.ARRAY_BUFFER, malha.buffer);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, BYTES_POR_VERTICE, 0);
        if (completa) {
            gl.vertexAttribPointer(1, 4, gl.FLOAT, false, BYTES_POR_VERTICE, 12);
            gl.vertexAttribPointer(2, 4, gl.FLOAT, false, BYTES_POR_VERTICE, 28);
            gl.vertexAttribPointer(3, 2, gl.FLOAT, false, BYTES_POR_VERTICE, 44);
        }
        gl.drawArrays(gl.TRIANGLES, 0, malha.numVertices);
        this.chamadas++;
    }

    // liga o cubo de lado 1 e as caixas da fila aos atributos
    ligaCaixas() {
        var gl = this.gl;
        var passo = FLOATS_POR_CAIXA * 4;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufferCubo);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.filaCaixas.buffer);
        gl.vertexAttribPointer(4, 3, gl.FLOAT, false, passo, 0);
        gl.vertexAttribPointer(5, 3, gl.FLOAT, false, passo, 12);
        gl.vertexAttribPointer(6, 3, gl.FLOAT, false, passo, 24);
        gl.vertexAttribPointer(7, 4, gl.FLOAT, false, passo, 36);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indicesCubo);
    }

    // ----- o quadro, passo a passo -----
    // sombra (vista do sol) -> cena -> céu -> sombras redondas -> brilhos
    renderiza() {
        var gl = this.gl;
        this.chamadas = 0;
        if (!this.ajustaTamanho()) {
            return;
        }
        var cronometro = this.cronometro;
        if (cronometro !== null) {
            this.leCronometro();
            this.comecaCronometro();
        }
        // as caixas vão para a placa uma vez só: a sombra e a cena usam as mesmas
        this.enviaFila(this.filaCaixas);
        var temCena = this.numMalhas > 0 || this.filaCaixas.quantidade > 0;
        var comSombra = (this.mapaSombra !== null && temCena) ? 1 : 0;
        if (comSombra) {
            this.passoSombra();
        }
        this.passoCena(comSombra);
        this.desenhaCeu();
        // (a qualidade pode ter mudado depois das sombras redondas entrarem na fila)
        if (this.filaBolhas.quantidade > 0 && this.mapaSombra === null) {
            this.desenhaBolhas();
        }
        if (this.filaBrilhos.quantidade > 0) {
            this.desenhaBrilhos();
        }
        // deixa o estado do jeito que o próximo quadro espera
        gl.depthMask(true);
        gl.disable(gl.BLEND);
        gl.enable(gl.CULL_FACE);
        if (cronometro !== null) {
            this.terminaCronometro();
        }
    }

    // ----- cronômetro da placa de vídeo -----
    // Quando o navegador tem a extensão EXT_disjoint_timer_query, a placa
    // conta quanto tempo gastou desenhando cada quadro. A resposta só chega
    // alguns quadros depois, então 4 medidas giram em roda. A resolução
    // dinâmica usa esse tempo só como uma pista a mais, para voltar a subir
    // mais cedo quando sobra placa; sem ele, decide com o tempo entre os
    // quadros.
    preparaCronometro() {
        var gl = this.gl;
        this.cronometro = null;
        var ext = gl.getExtension(this.webgl2 ? "EXT_disjoint_timer_query_webgl2" : "EXT_disjoint_timer_query");
        if (!ext) {
            return;
        }
        var consultas = [];
        for (var i = 0; i < 4; i++) {
            var consulta = this.webgl2 ? gl.createQuery() : ext.createQueryEXT();
            if (!consulta) {
                return;
            }
            consultas.push(consulta);
        }
        this.cronometro = {
            ext: ext,
            consultas: consultas,
            estado: new Uint8Array(4),      // 0 livre, 1 esperando a resposta, 2 resposta que não vale
            degrau: new Int8Array(4),       // degrau da escala do quadro medido
            proxima: 0,                     // a próxima a começar
            maisVelha: 0,                   // a próxima a ser lida
            medindo: false
        };
    }

    comecaCronometro() {
        var c = this.cronometro;
        if (c.medindo) {
            this.terminaCronometro();       // o quadro anterior parou no meio (erro)
        }
        var i = c.proxima;
        if (c.estado[i] !== 0) {
            return;                         // as 4 esperam resposta: este quadro fica sem medida
        }
        if (this.webgl2) {
            this.gl.beginQuery(c.ext.TIME_ELAPSED_EXT, c.consultas[i]);
        } else {
            c.ext.beginQueryEXT(c.ext.TIME_ELAPSED_EXT, c.consultas[i]);
        }
        c.degrau[i] = this.degrau;
        c.medindo = true;
    }

    terminaCronometro() {
        var c = this.cronometro;
        if (!c.medindo) {
            return;
        }
        if (this.webgl2) {
            this.gl.endQuery(c.ext.TIME_ELAPSED_EXT);
        } else {
            c.ext.endQueryEXT(c.ext.TIME_ELAPSED_EXT);
        }
        c.estado[c.proxima] = 1;
        c.proxima = (c.proxima + 1) & 3;
        c.medindo = false;
    }

    // junta na janela da resolução dinâmica as medidas que já chegaram
    leCronometro() {
        var gl = this.gl;
        var c = this.cronometro;
        var ext = c.ext;
        for (var n = 0; n < 4; n++) {
            var i = c.maisVelha;
            if (c.estado[i] === 0) {
                return;
            }
            var consulta = c.consultas[i];
            var pronta = this.webgl2 ? gl.getQueryParameter(consulta, gl.QUERY_RESULT_AVAILABLE) :
                ext.getQueryObjectEXT(consulta, ext.QUERY_RESULT_AVAILABLE_EXT);
            if (!pronta) {
                return;
            }
            // Se o relógio da placa "pulou" (economia de energia, troca de
            // placa), nenhuma medida em andamento vale.
            if (n === 0 && gl.getParameter(ext.GPU_DISJOINT_EXT)) {
                for (var k = 0; k < 4; k++) {
                    if (c.estado[k] === 1) {
                        c.estado[k] = 2;
                    }
                }
            }
            if (c.estado[i] === 1 && c.degrau[i] === this.degrau) {
                var ns = this.webgl2 ? gl.getQueryParameter(consulta, gl.QUERY_RESULT) :
                    ext.getQueryObjectEXT(consulta, ext.QUERY_RESULT_EXT);
                this.somaPlaca += ns / 1e6;
                this.numPlaca++;
            }
            c.estado[i] = 0;
            c.maisVelha = (i + 1) & 3;
        }
    }

    // Desenha só a profundidade de tudo, vista do sol. As faces da frente
    // são descartadas (só as de trás entram no mapa): assim uma superfície
    // iluminada nunca faz sombra em cima dela mesma.
    passoSombra() {
        var gl = this.gl;
        var mapa = this.mapaSombra;
        var i, p;
        gl.bindFramebuffer(gl.FRAMEBUFFER, mapa.quadro);
        gl.viewport(0, 0, mapa.tamanho, mapa.tamanho);
        gl.clearColor(1, 1, 1, 1);          // 1 = "longe": tudo iluminado
        gl.depthMask(true);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LESS);
        gl.enable(gl.CULL_FACE);
        gl.cullFace(gl.FRONT);
        gl.disable(gl.BLEND);
        // o mapa não pode estar ligado como textura enquanto é desenhado
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, null);

        if (this.numMalhas > 0) {
            p = this.progSombraMalha;
            this.usaPrograma(p);
            this.usaAtributos(ATRIB_SOMBRA_MALHA);
            gl.uniformMatrix4fv(p.u.uLuzVP, false, this.luzVP);
            for (i = 0; i < this.numMalhas; i++) {
                gl.uniform4fv(p.u.uTransforma, this.vistasTransforma[i]);
                this.desenhaMalhaCrua(this.filaMalhas[i], false);
            }
        }
        if (this.filaCaixas.quantidade > 0) {
            p = this.progSombraCaixa;
            this.usaPrograma(p);
            this.usaAtributos(ATRIB_SOMBRA_CAIXA);
            gl.uniformMatrix4fv(p.u.uLuzVP, false, this.luzVP);
            this.ligaCaixas();
            this.desenhaElementosInstancias(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0, this.filaCaixas.quantidade);
            this.chamadas++;
        }
        gl.cullFace(gl.BACK);
    }

    // valores da luz e da névoa, iguais para malhas e caixas
    uniformsDaCena(p, comSombra) {
        var gl = this.gl;
        var u = p.u, a = this.amb;
        gl.uniformMatrix4fv(u.uVP, false, this.vp);
        gl.uniform3fv(u.uOlho, this.olho);
        gl.uniform3fv(u.uLuzCor, a.luz);
        gl.uniform3fv(u.uParaLuz, this.paraLuz);
        gl.uniform3fv(u.uAmbiente, a.ambiente);
        gl.uniform3fv(u.uChaoLuz, a.chaoLuz);
        gl.uniform3fv(u.uNevoaCor, a.nevoa);
        gl.uniform2fv(u.uNevoa, this.nevoaParams);
        gl.uniform1fv(u.uPixelMundo, this.pixelMundo);
        gl.uniform1f(u.uBranco, 0);
        if (comSombra) {
            gl.uniformMatrix4fv(u.uLuzVP, false, this.luzVP);
            gl.uniform1fv(u.uDeslocaSombra, this.deslocaSombra);
            gl.uniform1i(u.uMapaSombra, 0);
            gl.uniform2fv(u.uSombraInfo, this.sombraInfo);
        }
    }

    // a cena de verdade: malhas (uma chamada cada) e todas as caixas (uma chamada)
    passoCena(comSombra) {
        var gl = this.gl;
        var i, p;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        // a cor de limpeza nunca aparece: o céu cobre todo pixel vazio
        gl.clearColor(0, 0, 0, 1);
        gl.depthMask(true);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LESS);
        gl.enable(gl.CULL_FACE);
        gl.cullFace(gl.BACK);
        gl.disable(gl.BLEND);
        if (comSombra) {
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this.mapaSombra.textura);
            this.sombraInfo[0] = this.mapaSombra.tamanho;
            this.sombraInfo[1] = this.viesLuz;
            this.deslocaSombra[0] = this.larguraLuz / this.mapaSombra.tamanho;
        }
        // quanto mede um pixel da tela a 1 unidade de distância (padrões)
        this.pixelMundo[0] = 2 * Math.tan(this.fov / 2) / gl.drawingBufferHeight;

        if (this.numMalhas > 0) {
            p = this.progMalha[comSombra];
            this.usaPrograma(p);
            this.usaAtributos(ATRIB_MALHA);
            this.uniformsDaCena(p, comSombra);
            for (i = 0; i < this.numMalhas; i++) {
                gl.uniform4fv(p.u.uTransforma, this.vistasTransforma[i]);
                gl.uniform1fv(p.u.uBranco, this.vistasBranco[i]);
                this.desenhaMalhaCrua(this.filaMalhas[i], true);
            }
        }
        if (this.filaCaixas.quantidade > 0) {
            p = this.progCaixa[comSombra];
            this.usaPrograma(p);
            this.usaAtributos(ATRIB_CAIXA);
            this.uniformsDaCena(p, comSombra);
            this.ligaCaixas();
            this.desenhaElementosInstancias(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0, this.filaCaixas.quantidade);
            this.chamadas++;
        }
    }

    // O céu passa no teste de profundidade só onde nada foi desenhado
    // (LEQUAL com a profundidade 1.0 do fundo): nenhum pixel é pintado à toa.
    desenhaCeu() {
        var gl = this.gl;
        var a = this.amb;
        var p = this.progCeu;
        var u = p.u;
        gl.depthFunc(gl.LEQUAL);
        gl.depthMask(false);
        gl.disable(gl.CULL_FACE);
        this.usaPrograma(p);
        this.usaAtributos(ATRIB_CEU);
        gl.uniform3fv(u.uFrente, this.frente);
        gl.uniform3fv(u.uDireita, this.ceuDireita);
        gl.uniform3fv(u.uCima, this.ceuCima);
        gl.uniform3fv(u.uTopo, a.ceuTopo);
        gl.uniform3fv(u.uHorizonte, a.ceuHorizonte);
        gl.uniform3fv(u.uSol, this.paraLuz);
        gl.uniform3fv(u.uLuzCor, a.luz);
        gl.uniform3fv(u.uNevoaCor, a.nevoa);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufferCeu);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        this.chamadas++;
        gl.depthFunc(gl.LESS);
    }

    // sombras redondas: transparentes, deitadas no chão, sem escrever profundidade
    desenhaBolhas() {
        var gl = this.gl;
        var p = this.progBolha;
        this.enviaFila(this.filaBolhas);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(false);
        gl.disable(gl.CULL_FACE);
        // puxa um pouco para a frente na profundidade: não briga com o chão
        gl.enable(gl.POLYGON_OFFSET_FILL);
        gl.polygonOffset(-1, -4);
        this.usaPrograma(p);
        this.usaAtributos(ATRIB_BOLHA);
        gl.uniformMatrix4fv(p.u.uVP, false, this.vp);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufferQuadrado);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.filaBolhas.buffer);
        gl.vertexAttribPointer(4, 4, gl.FLOAT, false, FLOATS_POR_BOLHA * 4, 0);
        this.desenhaVerticesInstancias(gl.TRIANGLE_STRIP, 0, 4, this.filaBolhas.quantidade);
        this.chamadas++;
        gl.disable(gl.POLYGON_OFFSET_FILL);
    }

    // brilhos: somados à imagem (ONE, ONE), testam a profundidade mas não escrevem
    desenhaBrilhos() {
        var gl = this.gl;
        var p = this.progBrilho;
        var u = p.u;
        this.enviaFila(this.filaBrilhos);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);
        gl.depthMask(false);
        gl.disable(gl.CULL_FACE);
        this.usaPrograma(p);
        this.usaAtributos(ATRIB_BRILHO);
        gl.uniformMatrix4fv(u.uVP, false, this.vp);
        gl.uniform3fv(u.uOlho, this.olho);
        gl.uniform3fv(u.uDireita, this.direita);
        gl.uniform3fv(u.uCima, this.cima);
        gl.uniform2fv(u.uNevoa, this.nevoaParams);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.bufferQuadrado);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.filaBrilhos.buffer);
        gl.vertexAttribPointer(4, 4, gl.FLOAT, false, FLOATS_POR_BRILHO * 4, 0);
        gl.vertexAttribPointer(5, 4, gl.FLOAT, false, FLOATS_POR_BRILHO * 4, 16);
        this.desenhaVerticesInstancias(gl.TRIANGLE_STRIP, 0, 4, this.filaBrilhos.quantidade);
        this.chamadas++;
    }
}
