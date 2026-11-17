/* =====================================================================
   OUTLAW 3D - classes do jogo (orientação a objetos)
   Segue a estrutura do material "Jogo da Abelha": a classe Obj é a
   classe-mãe e as outras herdam dela com "extends".

       Obj
        |-- Cenario      (a rua e a cidade em volta do campo)
        |-- Pistoleiro   (os dois jogadores)
        |-- Bala
        |-- Alvo         (modo de um jogador)
        |-- Particula    (poeira, fumaça e estilhaços)
        |-- Obstaculo
              |-- Cacto
              |-- Diligencia
              |-- Muro
       Texto, Menu, Som e Camera não são objetos da cena, por isso não
       herdam de Obj.

   O mundo agora é 3D: x vai para a direita da tela, y para cima e z para
   perto da câmera. Tudo é desenhado pelo pincel 3D (motor3d.js); o placar
   e as letras vão num segundo canvas, o HUD, por cima do 3D.
   ===================================================================== */

// ----- medidas do HUD (o canvas do placar tem sempre 900 x 640) -----
var LARGURA = 900;
var ALTURA = 640;
var ALTURA_PLACAR = 72;     // faixa de cima, onde ficam os pontos

// O campo do duelo é um retângulo no chão da rua. "fundo" é a borda de
// longe (a cerca) e "frente" a de perto (o corrimão baixo). O que no Atari
// era "subir na tela" aqui é andar para o fundo.
var CAMPO = {
    esquerda: 0,
    direita: 900,
    fundo: 0,
    frente: 432
};

// a bala anda em vários passos pequenos por quadro para não "atravessar"
// um bloco ou um pistoleiro sem que a colisão seja percebida
var PASSOS_BALA = 3;
var VELOCIDADE_BALA = 3.4;              // unidades por passo
var ALTURA_DA_BALA = 70;                // a bala voa sempre nesta altura (a do peito)
// profundidade da caixa de colisão do pistoleiro: o boneco 3D olha para o
// rival, então de um braço ao outro (7 cubinhos, na altura da bala) é
// para dentro da tela
var PROF_PISTOLEIRO = 7 * PIXEL_L;
var ANGULO_MIRA = Math.atan(0.62);      // ângulo da diagonal (a mesma do Atari)
var GIRO_DA_VITORIA = 1.0;              // quanto o vencedor se vira para a câmera (uns 57 graus)

// Pinta uma matriz de pixels (veja sprites.js) num contexto 2D, na
// posição x, y. "paleta" pode ser uma cor só ou um objeto que diz a cor
// de cada letra. Serve para as letras do placar e para os retratos da
// página quando o navegador não tem WebGL.
function pintaMatriz(ctx, matriz, x, y, larguraPixel, alturaPixel, paleta, espelhado) {
    for (var l = 0; l < matriz.length; l++) {
        var linha = matriz[l];
        var c = 0;
        while (c < linha.length) {
            var letra = linha[c];
            if (letra === ".") {
                c++;
                continue;
            }
            // junta pixels vizinhos da mesma cor em um retângulo só
            var inicio = c;
            while (c < linha.length && linha[c] === letra) {
                c++;
            }
            var coluna = espelhado ? linha.length - c : inicio;
            ctx.fillStyle = (typeof paleta === "string") ? paleta : paleta[letra];
            ctx.fillRect(x + coluna * larguraPixel, y + l * alturaPixel, (c - inicio) * larguraPixel, alturaPixel);
        }
    }
}

// Mistura duas cores "#rrggbb" (t = 0 dá a primeira, t = 1 a segunda).
// Só é usada para montar o cenário, nunca a cada quadro.
function misturaCor(a, b, t) {
    var resultado = "#";
    for (var i = 1; i < 7; i += 2) {
        var v1 = parseInt(a.substr(i, 2), 16);
        var v2 = parseInt(b.substr(i, 2), 16);
        var v = Math.round(v1 + (v2 - v1) * t);
        resultado += (v < 16 ? "0" : "") + v.toString(16);
    }
    return resultado;
}

// guarda uma caixa na lista que vira a malha do cenário
function poeCaixa(caixas, x, y, z, l, a, p, cor, material, rotY) {
    caixas.push({ x: x, y: y, z: z, l: l, a: a, p: p, cor: cor, material: material || 0, rotY: rotY || 0 });
}

/* ------------------------------ Obj ------------------------------ */

class Obj {
    frame = 1;
    timer = 0;
    fase = 0;                   // quanto do ciclo da animação já passou (0 a 1)
    material = MATERIAL.LISO;

    // (x, y, z) é o canto de menor coordenada da caixa do objeto
    constructor(x, y, z, width, height, depth, color) {
        this.x = x;
        this.y = y;
        this.z = z;
        this.width = width;
        this.height = height;
        this.depth = depth;
        this.color = color;
        // posição no começo do passo e posição desenhada (interpolação)
        this.xAnt = x;
        this.yAnt = y;
        this.zAnt = z;
        this.xi = x;
        this.yi = y;
        this.zi = z;
    }

    // A lógica roda 60 vezes por segundo, mas o monitor pode desenhar mais
    // vezes que isso. Guardando onde o objeto estava no começo do passo,
    // o desenho pode ficar "no meio do caminho" e o movimento sai liso.
    guardaPosicao() {
        this.xAnt = this.x;
        this.yAnt = this.y;
        this.zAnt = this.z;
    }

    // alfa = quanto do próximo passo já passou (0 a 1)
    interpola(alfa) {
        this.xi = this.xAnt + (this.x - this.xAnt) * alfa;
        this.yi = this.yAnt + (this.y - this.yAnt) * alfa;
        this.zi = this.zAnt + (this.z - this.zAnt) * alfa;
    }

    desenha(alfa) {
        this.interpola(alfa);
        pincel.caixa(this.xi, this.yi, this.zi, this.width, this.height, this.depth, this.color, this.material, 0);
    }

    // colisão entre duas caixas (agora em três eixos)
    collide(obj) {
        if (this.x < obj.x + obj.width &&
            this.x + this.width > obj.x &&
            this.y < obj.y + obj.height &&
            this.y + this.height > obj.y &&
            this.z < obj.z + obj.depth &&
            this.z + this.depth > obj.z) {
            return true;
        } else {
            return false;
        }
    }

    // troca de quadro a cada "espera" atualizações
    animation(quadros, espera) {
        this.timer += 1;
        if (this.timer > espera) {
            this.timer = 0;
            this.frame += 1;
            if (this.frame > quadros) {
                this.frame = 1;
            }
        }
        this.fase = ((this.frame - 1) * (espera + 1) + this.timer) / (quadros * (espera + 1));
    }
}

/* ---------------------------- Cenario ---------------------------- */

// A rua da cidade: o campo do duelo, a moldura, a cerca do fundo com a
// calçada de tábuas, as lojas de fachada falsa, o poço, barris, feno e
// as chapadas lá longe. Tudo isso é parado, então vira uma malha só
// (uma chamada de desenho), montada uma vez para cada paleta.
class Cenario extends Obj {
    static malhas = new Map();
    static ambientes = new Map();

    constructor(paleta) {
        super(CAMPO.esquerda, -1, CAMPO.fundo, CAMPO.direita - CAMPO.esquerda, 1, CAMPO.frente - CAMPO.fundo, paleta.campo);
        this.defineTema(paleta);
    }

    // troca as cores da cidade junto com o obstáculo escolhido
    defineTema(paleta) {
        this.paleta = paleta;
        this.color = paleta.campo;
        this.corBorda = paleta.bloco;
        this.corPoeira = misturaCor(paleta.campo, "#e8d8b8", 0.55);
        if (!Cenario.malhas.has(paleta)) {
            Cenario.malhas.set(paleta, pincel.criaMalhaCaixas(this.montaCidade(paleta)));
            Cenario.ambientes.set(paleta, {
                ceuTopo: paleta.ceuTopo,
                ceuHorizonte: paleta.ceuHorizonte,
                luz: paleta.luz,
                ambiente: paleta.ambiente,
                chaoLuz: paleta.chaoLuz,
                nevoa: paleta.nevoa,
                nevoaInicio: 1400,
                nevoaFim: 4200,
                direcaoLuz: paleta.direcaoLuz
            });
        }
        this.malha = Cenario.malhas.get(paleta);
        this.ambiente = Cenario.ambientes.get(paleta);
    }

    desenha() {
        pincel.defineAmbiente(this.ambiente);
        pincel.malha(this.malha, 0, 0, 0, 0, 0);
    }

    montaCidade(p) {
        var M = MATERIAL;
        var caixas = [];
        // as madeiras e as pedras puxam um pouco para as cores da paleta,
        // assim cada cenário continua com a sua cara
        var madeira = misturaCor("#8a5a35", p.sombra, 0.18);
        var madeiraClara = misturaCor("#a87b4f", p.bloco, 0.15);
        var madeiraEscura = misturaCor("#5c3a22", p.sombra, 0.22);
        var ferro = "#2b2a30";
        var rua = misturaCor(p.campo, p.chao, 0.55);
        var rocha = misturaCor("#b0603c", p.nevoa, 0.35);
        var rochaEscura = misturaCor(rocha, "#1a1020", 0.3);
        var palha = misturaCor("#d9b65a", p.bloco, 0.12);
        var verde = misturaCor("#4f8f52", p.sombra, 0.25);

        // ----- chão -----
        // terra até o horizonte (some na névoa), a rua que continua para os
        // lados e o campo do duelo, um pouquinho mais alto que tudo
        poeCaixa(caixas, -6000, -21, -6000, 12900, 20, 12000, p.chao, M.AREIA);
        poeCaixa(caixas, -6000, -1.5, -10, 12900, 1, 558, rua, M.AREIA);
        poeCaixa(caixas, CAMPO.esquerda, -1, CAMPO.fundo, CAMPO.direita, 1, CAMPO.frente, p.campo, M.AREIA);

        // moldura do campo (a borda de 14 pixels do jogo 2D) nas laterais e na frente
        poeCaixa(caixas, -14, -1, -10, 14, 5, 456, p.bloco, M.LISO);
        poeCaixa(caixas, CAMPO.direita, -1, -10, 14, 5, 456, p.bloco, M.LISO);
        poeCaixa(caixas, 0, -1, CAMPO.frente, CAMPO.direita, 5, 14, p.bloco, M.LISO);

        // ----- cerca do fundo: é nela que a bala ricocheteia -----
        poeCaixa(caixas, -14, 0, -7, 928, 78, 6, madeiraClara, M.MADEIRA);
        poeCaixa(caixas, -18, 78, -10, 936, 5, 11, madeiraEscura, M.MADEIRA);
        for (var i = 0; i <= 10; i++) {
            var xp = -14 + i * 92.8;
            poeCaixa(caixas, xp - 4, 0, -11, 8, 88, 11, madeiraEscura, M.MADEIRA);
            poeCaixa(caixas, xp - 5, 88, -12, 10, 3, 13, madeira, M.LISO);
        }

        // ----- corrimão baixo da frente: baixinho para nunca esconder ninguém -----
        poeCaixa(caixas, -14, 21, 437, 928, 5, 5, madeiraEscura, M.MADEIRA);
        poeCaixa(caixas, -14, 11, 438, 928, 3, 3, madeiraEscura, M.MADEIRA);
        for (var i = 0; i <= 12; i++) {
            poeCaixa(caixas, -14 + i * 76.5, 4, 436, 6, 22, 7, madeira, M.MADEIRA);
        }

        // ----- calçada de tábuas na frente das lojas -----
        poeCaixa(caixas, -290, 0, -96, 1480, 13, 85, madeira, M.MADEIRA);
        poeCaixa(caixas, -290, 0, -12, 1480, 13, 2, madeiraEscura, M.MADEIRA);

        // ----- as lojas -----
        var predios = [
            { x: -282, l: 200, a: 150, frente: 206, cor: "#9c6b43", material: M.MADEIRA, nome: "ARMAZÉM", tipo: "toldo" },
            { x: -62, l: 192, a: 176, frente: 230, cor: "#b0574a", material: M.TIJOLO, nome: "BANCO", tipo: "comum" },
            { x: 150, l: 172, a: 236, frente: 272, cor: "#8a7f9a", material: M.MADEIRA, nome: "HOTEL", tipo: "sobrado" },
            { x: 342, l: 262, a: 214, frente: 292, cor: "#a3643a", material: M.MADEIRA, nome: "SALOON", tipo: "saloon" },
            { x: 624, l: 180, a: 164, frente: 214, cor: "#8d8577", material: M.TIJOLO, nome: "XERIFE", tipo: "cadeia" },
            { x: 824, l: 262, a: 150, frente: 150, cor: "#8f3b2c", material: M.MADEIRA, nome: "ESTÁBULO", tipo: "celeiro" }
        ];
        for (var i = 0; i < predios.length; i++) {
            this.predio(caixas, predios[i], p, madeira, madeiraEscura, ferro);
        }

        // ----- lado esquerdo da rua: o poço, barris, feno e cactos -----
        this.poco(caixas, -150, 300, madeiraEscura, madeira);
        this.barril(caixas, -52, 52, madeira, ferro);
        this.barril(caixas, -82, 40, madeiraClara, ferro);
        this.barril(caixas, -64, 82, madeira, ferro);
        this.palanque(caixas, -60, 150, 110, madeiraEscura);
        poeCaixa(caixas, -100, 0, 160, 30, 22, 90, madeira, M.MADEIRA);            // cocho de água
        poeCaixa(caixas, -96, 22, 164, 22, 1, 82, "#2a3c66", M.LISO);
        this.feno(caixas, -110, 410, 0.15, palha);
        this.feno(caixas, -60, 418, -0.2, palha);
        this.feno(caixas, -86, 412, 0.05, palha, 26);
        this.cactinho(caixas, -250, 120, 70, verde);
        this.cactinho(caixas, -262, 430, 54, verde);
        this.pedra(caixas, -40, 520, 26, rocha, 0.4);
        this.pedra(caixas, -150, 560, 40, rochaEscura, 1.1);

        // ----- lado direito: caixa d'água, barris, caixotes e feno -----
        this.caixaDagua(caixas, 1080, 300, madeira, madeiraEscura, ferro);
        this.barril(caixas, 952, 50, madeira, ferro);
        this.barril(caixas, 984, 64, madeiraClara, ferro);
        poeCaixa(caixas, 940, 0, 96, 34, 30, 34, madeiraClara, M.MADEIRA, 0.2);   // caixotes
        poeCaixa(caixas, 944, 30, 100, 26, 22, 26, madeira, M.MADEIRA, -0.1);
        this.palanque(caixas, 958, 180, 110, madeiraEscura);
        this.feno(caixas, 990, 420, -0.3, palha);
        this.feno(caixas, 1040, 400, 0.4, palha);
        this.cactinho(caixas, 1160, 80, 64, verde);
        this.cactinho(caixas, 1150, 470, 80, verde);
        this.pedra(caixas, 1150, 560, 30, rocha, 0.8);

        // ----- o outro lado da rua, perto da câmera: só coisas baixas, que
        // não escondem ninguém -----
        poeCaixa(caixas, -290, 0, 548, 1480, 12, 92, madeira, M.MADEIRA);
        poeCaixa(caixas, -290, 0, 546, 1480, 12, 3, madeiraEscura, M.MADEIRA);
        this.palanqueAoLongo(caixas, 40, 556, 150, madeiraEscura);
        this.palanqueAoLongo(caixas, 690, 556, 150, madeiraEscura);
        poeCaixa(caixas, 380, 0, 492, 110, 22, 30, madeira, M.MADEIRA);              // cocho de água
        poeCaixa(caixas, 384, 22, 496, 102, 1, 22, "#2a3c66", M.LISO);
        this.banco(caixas, 520, 598, madeiraClara, madeiraEscura);
        this.barril(caixas, 262, 600, madeira, ferro, 12);
        this.barril(caixas, 290, 590, madeiraClara, ferro, 12);
        poeCaixa(caixas, 836, 12, 584, 32, 30, 32, madeiraClara, M.MADEIRA, 0.15);  // caixotes
        poeCaixa(caixas, 872, 12, 594, 26, 24, 26, madeira, M.MADEIRA, -0.2);
        this.barril(caixas, -40, 496, madeira, ferro);
        this.barril(caixas, -70, 482, madeiraClara, ferro);
        this.feno(caixas, -150, 500, 0.3, palha);
        this.carroca(caixas, 960, 476, madeira, madeiraEscura, palha);
        this.lampiao(caixas, -190, 600, madeiraEscura);
        this.lampiao(caixas, 1090, 600, madeiraEscura);
        this.pedra(caixas, 160, 520, 18, rochaEscura, 0.5);
        this.pedra(caixas, 640, 506, 14, rocha, 1.7);

        // ----- chapadas lá longe, dentro da névoa -----
        var chapadas = [
            [-2300, -1900, 1000, 420, 600], [-800, -2500, 1300, 520, 700], [900, -2000, 800, 340, 500],
            [1900, -2700, 1300, 600, 700], [2900, -1700, 900, 380, 600], [-3300, -900, 700, 320, 800],
            [3900, -700, 700, 300, 700], [-4200, 900, 800, 360, 900], [4700, 1100, 800, 300, 900]
        ];
        for (var i = 0; i < chapadas.length; i++) {
            var c = chapadas[i];
            this.chapada(caixas, c[0], c[1], c[2], c[3], c[4], misturaCor(rocha, p.ceuHorizonte, (i % 3) * 0.08), rochaEscura);
        }
        return caixas;
    }

    // loja de fachada falsa (a frente é mais alta que o prédio, como nos filmes)
    predio(caixas, d, p, madeira, madeiraEscura, ferro) {
        var M = MATERIAL;
        var x0 = d.x;
        var w = d.l;
        var cx = x0 + w / 2;
        var parede = misturaCor(d.cor, p.bloco, 0.22);
        var enfeite = misturaCor("#4a3020", p.sombra, 0.35);
        var escuro = "#1a120c";

        if (d.tipo === "celeiro") {
            // estábulo: telhado em degraus, porta grande e o paiol de feno em cima
            var telhado = misturaCor(parede, "#000000", 0.3);
            poeCaixa(caixas, x0, 0, -320, w, d.a, 222, parede, M.MADEIRA);
            poeCaixa(caixas, x0 + 12, d.a, -322, w - 24, 34, 226, telhado, M.MADEIRA);
            poeCaixa(caixas, x0 + 48, d.a + 34, -322, w - 96, 26, 226, telhado, M.MADEIRA);
            poeCaixa(caixas, x0 + 86, d.a + 60, -322, w - 172, 10, 226, enfeite, M.MADEIRA);
            poeCaixa(caixas, cx - 52, 13, -97, 104, 124, 2, escuro, M.LISO);
            poeCaixa(caixas, cx - 56, 13, -96, 5, 128, 3, enfeite, M.MADEIRA);
            poeCaixa(caixas, cx + 51, 13, -96, 5, 128, 3, enfeite, M.MADEIRA);
            poeCaixa(caixas, cx - 56, 137, -96, 112, 5, 3, enfeite, M.MADEIRA);
            poeCaixa(caixas, cx - 50, 13, -96, 48, 122, 2, misturaCor(parede, "#ffffff", 0.12), M.MADEIRA);
            poeCaixa(caixas, cx + 2, 13, -96, 48, 122, 2, misturaCor(parede, "#ffffff", 0.12), M.MADEIRA);
            poeCaixa(caixas, cx - 50, 70, -94, 100, 5, 2, enfeite, M.MADEIRA);
            poeCaixa(caixas, cx - 20, d.a + 4, -97, 40, 26, 2, escuro, M.LISO);
            poeCaixa(caixas, cx - 15, d.a + 4, -95, 30, 7, 5, "#d6b35a", M.AREIA);
            this.placa(caixas, d.nome, cx, d.a + 36, w - 110);
            return;
        }

        // corpo do prédio e telhado (escondido atrás da fachada)
        poeCaixa(caixas, x0, 0, -320, w, d.a, 222, parede, d.material);
        poeCaixa(caixas, x0 - 4, d.a, -324, w + 8, 6, 228, enfeite, M.MADEIRA);
        // fachada falsa, cornija e tábuas de canto
        poeCaixa(caixas, x0, 0, -102, w, d.frente, 6, parede, d.material);
        poeCaixa(caixas, x0 - 6, d.frente, -106, w + 12, 7, 12, enfeite, M.MADEIRA);
        poeCaixa(caixas, cx - w * 0.2, d.frente + 7, -104, w * 0.4, 9, 8, enfeite, M.MADEIRA);
        poeCaixa(caixas, x0 - 2, 0, -97, 7, d.frente, 3, enfeite, M.MADEIRA);
        poeCaixa(caixas, x0 + w - 5, 0, -97, 7, d.frente, 3, enfeite, M.MADEIRA);

        // porta (a do saloon é a de vaivém, com a sala escura atrás)
        if (d.tipo === "saloon") {
            poeCaixa(caixas, cx - 24, 13, -97, 48, 104, 2, escuro, M.LISO);
            poeCaixa(caixas, cx - 28, 13, -97, 4, 108, 3, enfeite, M.MADEIRA);
            poeCaixa(caixas, cx + 24, 13, -97, 4, 108, 3, enfeite, M.MADEIRA);
            poeCaixa(caixas, cx - 22, 42, -95, 21, 46, 2, misturaCor(parede, "#ffffff", 0.2), M.MADEIRA);
            poeCaixa(caixas, cx + 1, 42, -95, 21, 46, 2, misturaCor(parede, "#ffffff", 0.2), M.MADEIRA);
        } else {
            poeCaixa(caixas, cx - 25, 13, -97, 50, 104, 3, enfeite, M.MADEIRA);
            poeCaixa(caixas, cx - 20, 13, -96, 40, 98, 3, misturaCor(madeiraEscura, parede, 0.3), M.MADEIRA);
            poeCaixa(caixas, cx + 12, 58, -93, 4, 4, 2, "#d9c27a", M.LISO);      // maçaneta
        }

        // janelas de baixo, uma de cada lado da porta
        var acesa = (d.tipo === "saloon" || d.tipo === "sobrado" || d.tipo === "toldo");
        var grades = (d.tipo === "cadeia");
        var lado = Math.min(w * 0.3, 70);
        this.janela(caixas, cx - lado - 22, 40, 40, 56, acesa, grades, enfeite, ferro);
        this.janela(caixas, cx + lado - 18, 40, 40, 56, acesa && d.tipo !== "toldo", grades, enfeite, ferro);

        // andar de cima
        if (d.tipo === "sobrado" || d.tipo === "saloon") {
            for (var j = 0; j < 3; j++) {
                this.janela(caixas, x0 + w * (0.2 + j * 0.3) - 16, 150, 32, 46, j !== 1, false, enfeite, ferro);
            }
        }

        // toldo de madeira com postes, ou a sacada do saloon
        if (d.tipo === "toldo" || d.tipo === "comum") {
            poeCaixa(caixas, x0 - 4, 124, -96, w + 8, 5, 62, madeira, M.MADEIRA);
            poeCaixa(caixas, x0 - 4, 120, -36, w + 8, 4, 3, madeiraEscura, M.MADEIRA);
            poeCaixa(caixas, x0 + 2, 13, -38, 6, 111, 6, madeiraEscura, M.MADEIRA);
            poeCaixa(caixas, x0 + w - 8, 13, -38, 6, 111, 6, madeiraEscura, M.MADEIRA);
        } else if (d.tipo === "saloon" || d.tipo === "sobrado") {
            var largura = w + 8;
            poeCaixa(caixas, x0 - 4, 128, -96, largura, 6, 58, madeira, M.MADEIRA);
            poeCaixa(caixas, x0 - 4, 160, -42, largura, 4, 5, madeiraEscura, M.MADEIRA);
            for (var b = 0; b <= Math.floor(largura / 13); b++) {
                poeCaixa(caixas, x0 - 3 + b * 13, 134, -41, 3, 26, 3, madeiraEscura, M.LISO);
            }
            poeCaixa(caixas, x0 + 2, 13, -44, 7, 115, 7, madeiraEscura, M.MADEIRA);
            poeCaixa(caixas, cx - 3, 13, -44, 7, 115, 7, madeiraEscura, M.MADEIRA);
            poeCaixa(caixas, x0 + w - 9, 13, -44, 7, 115, 7, madeiraEscura, M.MADEIRA);
        }

        // placa com o nome, no alto da fachada
        this.placa(caixas, d.nome, cx, d.frente - 46, w - 36);
    }

    janela(caixas, x, y, l, a, acesa, grades, enfeite, ferro) {
        var M = MATERIAL;
        poeCaixa(caixas, x - 4, y - 4, -97, l + 8, a + 8, 2, enfeite, M.MADEIRA);
        // vidro com luz de lampião por dentro (brilha sozinho) ou apagado
        poeCaixa(caixas, x, y, -96, l, a, 2, acesa ? "#ffc66e" : "#232742", acesa ? M.BRILHO : M.LISO);
        poeCaixa(caixas, x + l / 2 - 1.5, y, -94.5, 3, a, 1, enfeite, M.LISO);
        poeCaixa(caixas, x, y + a / 2 - 1.5, -94.5, l, 3, 1, enfeite, M.LISO);
        poeCaixa(caixas, x - 6, y - 8, -99, l + 12, 4, 6, enfeite, M.MADEIRA);
        if (grades) {
            for (var i = 1; i < 4; i++) {
                poeCaixa(caixas, x + i * l / 4 - 1.5, y, -94, 3, a, 2, ferro, M.LISO);
            }
        }
    }

    // tábua amarela com o nome da loja escrito com a fonte de pixels
    placa(caixas, nome, cx, y, larguraMaxima) {
        var t = 3;
        var largura = Math.min(nome.length * 6 * t + 14, larguraMaxima);
        poeCaixa(caixas, cx - largura / 2, y, -95, largura, 36, 3, CORES.destaque, MATERIAL.MADEIRA);
        poeCaixa(caixas, cx - largura / 2 - 2, y - 2, -96, largura + 4, 40, 1, "#3a2415", MATERIAL.LISO);
        this.escreve(caixas, nome, cx, y + 6, -92, t, "#3a2415");
    }

    // escreve um texto com caixinhas, uma para cada pedaço de linha da letra
    escreve(caixas, texto, cx, y, z, t, cor) {
        var x = cx - (texto.length * 6 * t - t) / 2;
        for (var i = 0; i < texto.length; i++) {
            var letra = texto[i];
            var acento = ACENTOS[letra];
            if (acento) {
                letra = acento[0];
                // a cedilha vai embaixo da letra; os outros acentos, em cima
                var yMarca = (acento[1] === "cedilha") ? y - 2 * t : y + 7 * t;
                this.pixels(caixas, MARCAS[acento[1]], x + i * 6 * t, yMarca, z, t, cor);
            }
            this.pixels(caixas, FONTE[letra] || FONTE["?"], x + i * 6 * t, y, z, t, cor);
        }
    }

    // y = base da matriz (a linha 0 da matriz é a de cima)
    pixels(caixas, matriz, x, y, z, t, cor) {
        for (var l = 0; l < matriz.length; l++) {
            var linha = matriz[l];
            var c = 0;
            while (c < linha.length) {
                if (linha[c] === ".") {
                    c++;
                    continue;
                }
                var inicio = c;
                while (c < linha.length && linha[c] !== ".") {
                    c++;
                }
                poeCaixa(caixas, x + inicio * t, y + (matriz.length - 1 - l) * t, z, (c - inicio) * t, t, 2, cor, MATERIAL.LISO);
            }
        }
    }

    // "o único poço" da cidade, o da história do jogo
    poco(caixas, cx, cz, madeiraEscura, madeira) {
        var M = MATERIAL;
        var pedra = "#8d8578";
        poeCaixa(caixas, cx - 34, 0, cz - 34, 68, 42, 68, pedra, M.TIJOLO);
        poeCaixa(caixas, cx - 34, 0, cz - 34, 68, 42, 68, pedra, M.TIJOLO, Math.PI / 4);
        poeCaixa(caixas, cx - 37, 42, cz - 37, 74, 5, 74, "#6f685e", M.LISO, Math.PI / 8);
        poeCaixa(caixas, cx - 24, 42, cz - 24, 48, 6, 48, "#14203a", M.LISO, Math.PI / 8);
        poeCaixa(caixas, cx - 40, 47, cz - 4, 7, 80, 8, madeiraEscura, M.MADEIRA);
        poeCaixa(caixas, cx + 33, 47, cz - 4, 7, 80, 8, madeiraEscura, M.MADEIRA);
        poeCaixa(caixas, cx - 52, 127, cz - 28, 104, 5, 56, madeira, M.MADEIRA);
        poeCaixa(caixas, cx - 52, 132, cz - 9, 104, 6, 18, madeiraEscura, M.MADEIRA);
        poeCaixa(caixas, cx - 33, 104, cz - 2, 66, 4, 4, "#6b6258", M.LISO);
        poeCaixa(caixas, cx - 1, 76, cz - 1, 2, 28, 2, "#cdb98a", M.LISO);
        poeCaixa(caixas, cx - 7, 62, cz - 7, 14, 14, 14, madeira, M.MADEIRA);
    }

    // barril: duas caixas giradas formam um octógono, com dois aros de ferro
    // (y = altura do chão onde ele está, 0 na rua)
    barril(caixas, cx, cz, cor, ferro, y) {
        var M = MATERIAL;
        var y0 = y || 0;
        for (var g = 0; g < 2; g++) {
            var giro = g * Math.PI / 4;
            poeCaixa(caixas, cx - 12, y0, cz - 12, 24, 36, 24, cor, M.MADEIRA, giro);
            poeCaixa(caixas, cx - 13, y0 + 7, cz - 13, 26, 3, 26, ferro, M.LISO, giro);
            poeCaixa(caixas, cx - 13, y0 + 27, cz - 13, 26, 3, 26, ferro, M.LISO, giro);
        }
        poeCaixa(caixas, cx - 10, y0 + 36, cz - 10, 20, 1, 20, misturaCor(cor, "#000000", 0.25), M.LISO, Math.PI / 8);
    }

    // poste de amarrar cavalos, com a trave ao longo da rua (eixo Z)
    palanque(caixas, x, z, comprimento, cor) {
        var M = MATERIAL;
        poeCaixa(caixas, x, 0, z, 7, 42, 7, cor, M.MADEIRA);
        poeCaixa(caixas, x, 0, z + comprimento - 7, 7, 42, 7, cor, M.MADEIRA);
        poeCaixa(caixas, x - 1, 36, z - 3, 9, 6, comprimento + 6, cor, M.MADEIRA);
    }

    // o mesmo poste, mas com a trave de lado (eixo X), na beira da calçada
    palanqueAoLongo(caixas, x, z, comprimento, cor) {
        var M = MATERIAL;
        poeCaixa(caixas, x, 0, z, 7, 44, 7, cor, M.MADEIRA);
        poeCaixa(caixas, x + comprimento - 7, 0, z, 7, 44, 7, cor, M.MADEIRA);
        poeCaixa(caixas, x - 3, 38, z - 1, comprimento + 6, 6, 9, cor, M.MADEIRA);
    }

    feno(caixas, cx, cz, giro, cor, y) {
        poeCaixa(caixas, cx - 24, y || 0, cz - 15, 48, 26, 30, cor, MATERIAL.AREIA, giro);
    }

    banco(caixas, x, z, madeiraClara, madeiraEscura) {
        var M = MATERIAL;
        poeCaixa(caixas, x + 4, 12, z + 2, 5, 18, 14, madeiraEscura, M.MADEIRA);
        poeCaixa(caixas, x + 75, 12, z + 2, 5, 18, 14, madeiraEscura, M.MADEIRA);
        poeCaixa(caixas, x, 30, z, 84, 5, 18, madeiraClara, M.MADEIRA);
        poeCaixa(caixas, x, 35, z + 15, 84, 20, 4, madeiraClara, M.MADEIRA);
    }

    // carroça parada do outro lado da rua, com feno na caçamba
    carroca(caixas, x, z, madeira, madeiraEscura, palha) {
        var M = MATERIAL;
        poeCaixa(caixas, x, 30, z, 130, 10, 60, madeira, M.MADEIRA);
        poeCaixa(caixas, x, 40, z, 130, 20, 5, madeira, M.MADEIRA);
        poeCaixa(caixas, x, 40, z + 55, 130, 20, 5, madeira, M.MADEIRA);
        poeCaixa(caixas, x, 40, z, 5, 20, 60, madeiraEscura, M.MADEIRA);
        poeCaixa(caixas, x + 125, 40, z, 5, 20, 60, madeiraEscura, M.MADEIRA);
        poeCaixa(caixas, x + 8, 40, z + 6, 112, 16, 48, palha, M.AREIA);
        poeCaixa(caixas, x + 130, 24, z + 28, 70, 4, 4, madeiraEscura, M.MADEIRA);
        // rodas em pé, viradas para a câmera (plano X-Y)
        var rodas = [[x + 24, z - 6], [x + 106, z - 6], [x + 24, z + 60], [x + 106, z + 60]];
        for (var r = 0; r < rodas.length; r++) {
            for (var i = 0; i < RODA_PEQUENA.length; i++) {
                var parte = RODA_PEQUENA[i];
                poeCaixa(caixas, rodas[r][0] + parte[2], parte[0], rodas[r][1], parte[3], parte[1], 6, "#3b2a1a", M.MADEIRA);
            }
            poeCaixa(caixas, rodas[r][0] - 2, 4, rodas[r][1] + 1, 4, 52, 4, "#3b2a1a", M.MADEIRA);
            poeCaixa(caixas, rodas[r][0] - 26, 28, rodas[r][1] + 1, 52, 4, 4, "#3b2a1a", M.MADEIRA);
            poeCaixa(caixas, rodas[r][0] - 5, 25, rodas[r][1] - 1, 10, 10, 8, "#2b2a30", M.LISO);
        }
    }

    // poste com lampião aceso (o vidro brilha sozinho)
    lampiao(caixas, x, z, cor) {
        var M = MATERIAL;
        poeCaixa(caixas, x - 3, 12, z - 3, 6, 140, 6, cor, M.MADEIRA);
        poeCaixa(caixas, x - 3, 146, z - 16, 6, 4, 19, cor, M.MADEIRA);
        poeCaixa(caixas, x - 6, 128, z - 22, 12, 4, 12, "#2b2a30", M.LISO);
        poeCaixa(caixas, x - 5, 132, z - 21, 10, 12, 10, "#ffd27a", M.BRILHO);
        poeCaixa(caixas, x - 6, 144, z - 22, 12, 3, 12, "#2b2a30", M.LISO);
    }

    cactinho(caixas, cx, cz, altura, cor) {
        var M = MATERIAL;
        poeCaixa(caixas, cx - 7, 0, cz - 7, 14, altura, 14, cor, M.CACTO);
        poeCaixa(caixas, cx + 7, altura * 0.4, cz - 4, 10, 8, 8, cor, M.CACTO);
        poeCaixa(caixas, cx + 11, altura * 0.4, cz - 4, 8, altura * 0.38, 8, cor, M.CACTO);
        poeCaixa(caixas, cx - 15, altura * 0.55, cz - 4, 9, 7, 8, cor, M.CACTO);
        poeCaixa(caixas, cx - 18, altura * 0.55, cz - 4, 7, altura * 0.28, 8, cor, M.CACTO);
    }

    pedra(caixas, cx, cz, tamanho, cor, giro) {
        poeCaixa(caixas, cx - tamanho / 2, -1, cz - tamanho * 0.4, tamanho, tamanho * 0.55, tamanho * 0.8, cor, MATERIAL.AREIA, giro);
    }

    // caixa d'água de madeira sobre quatro pernas, típica das cidades do oeste
    caixaDagua(caixas, cx, cz, madeira, madeiraEscura, ferro) {
        var M = MATERIAL;
        var cantos = [[-30, -30], [23, -30], [-30, 23], [23, 23]];
        for (var i = 0; i < cantos.length; i++) {
            poeCaixa(caixas, cx + cantos[i][0], 0, cz + cantos[i][1], 7, 152, 7, madeiraEscura, M.MADEIRA);
        }
        poeCaixa(caixas, cx - 30, 70, cz - 28, 60, 5, 3, madeiraEscura, M.MADEIRA);
        poeCaixa(caixas, cx - 30, 70, cz + 25, 60, 5, 3, madeiraEscura, M.MADEIRA);
        poeCaixa(caixas, cx - 28, 110, cz - 30, 3, 5, 60, madeiraEscura, M.MADEIRA);
        poeCaixa(caixas, cx + 25, 110, cz - 30, 3, 5, 60, madeiraEscura, M.MADEIRA);
        poeCaixa(caixas, cx - 40, 150, cz - 40, 80, 4, 80, madeiraEscura, M.MADEIRA);
        for (var g = 0; g < 2; g++) {
            var giro = g * Math.PI / 4;
            poeCaixa(caixas, cx - 34, 154, cz - 34, 68, 62, 68, madeira, M.MADEIRA, giro);
            poeCaixa(caixas, cx - 35, 166, cz - 35, 70, 3, 70, ferro, M.LISO, giro);
            poeCaixa(caixas, cx - 35, 198, cz - 35, 70, 3, 70, ferro, M.LISO, giro);
            poeCaixa(caixas, cx - 30, 216, cz - 30, 60, 9, 60, madeiraEscura, M.MADEIRA, giro);
            poeCaixa(caixas, cx - 20, 225, cz - 20, 40, 9, 40, madeiraEscura, M.MADEIRA, giro);
        }
        poeCaixa(caixas, cx - 8, 234, cz - 8, 16, 8, 16, madeiraEscura, M.MADEIRA, Math.PI / 8);
    }

    // chapada: morro de topo reto, com a encosta de pedras soltas na frente
    chapada(caixas, x, z, l, a, p, cor, corEscura) {
        var M = MATERIAL;
        poeCaixa(caixas, x, -1, z, l, a, p, cor, M.AREIA);
        poeCaixa(caixas, x + l * 0.08, a - 1, z + p * 0.08, l * 0.84, a * 0.12, p * 0.84, cor, M.AREIA);
        poeCaixa(caixas, x - l * 0.06, -1, z + p * 0.55, l * 1.12, a * 0.32, p * 0.55, corEscura, M.AREIA);
        poeCaixa(caixas, x + l + 80, -1, z + p * 0.3, l * 0.18, a * 0.8, p * 0.22, cor, M.AREIA);
    }
}

/* ------------------------------ Bala ----------------------------- */

class Bala extends Obj {
    ativa = false;
    velX = 0;
    velZ = 0;
    ricocheteou = false;
    // onde o centro da bala estava no começo dos últimos passos (rastro)
    rastroX = new Float32Array(4);
    rastroZ = new Float32Array(4);

    constructor(color) {
        super(0, ALTURA_DA_BALA, 0, 14, 6, 6, color);
    }

    // (x, z) = onde fica o centro da bala
    // lado: 1 vai para a direita, -1 para a esquerda
    // mira: -1 vai na diagonal para o fundo, 0 vai reto, 1 vai para a frente
    dispara(x, z, lado, mira) {
        this.x = x - this.width / 2;
        this.y = ALTURA_DA_BALA;
        this.z = z - this.depth / 2;
        this.velX = lado * VELOCIDADE_BALA;
        this.velZ = mira * VELOCIDADE_BALA * 0.62;
        this.ativa = true;
        this.ricocheteou = false;
        // a bala aparece na ponta da arma: nada de rastro vindo de onde ela estava antes
        for (var i = 0; i < 4; i++) {
            this.rastroX[i] = x;
            this.rastroZ[i] = z;
        }
        this.guardaPosicao();
    }

    guardaPosicao() {
        super.guardaPosicao();
        for (var i = 3; i > 0; i--) {
            this.rastroX[i] = this.rastroX[i - 1];
            this.rastroZ[i] = this.rastroZ[i - 1];
        }
        this.rastroX[0] = this.x + this.width / 2;
        this.rastroZ[0] = this.z + this.depth / 2;
    }

    // anda um passo (o jogo chama PASSOS_BALA vezes por quadro)
    move() {
        this.x += this.velX;
        this.z += this.velZ;
        this.ricocheteou = false;

        // ricochete na cerca do fundo e no corrimão da frente
        if (this.z < CAMPO.fundo) {
            this.z = CAMPO.fundo;
            this.velZ = -this.velZ;
            this.ricocheteou = true;
        }
        if (this.z + this.depth > CAMPO.frente) {
            this.z = CAMPO.frente - this.depth;
            this.velZ = -this.velZ;
            this.ricocheteou = true;
        }

        // some quando chega a uma das laterais
        if (this.x < CAMPO.esquerda || this.x + this.width > CAMPO.direita) {
            this.ativa = false;
        }
    }

    desenha(alfa) {
        if (!this.ativa) {
            return;
        }
        this.interpola(alfa);
        var velocidade = Math.sqrt(this.velX * this.velX + this.velZ * this.velZ);
        var dx = this.velX / velocidade;
        var dz = this.velZ / velocidade;
        var giro = Math.atan2(-this.velZ, this.velX);
        var cx = this.xi + this.width / 2;
        var cy = this.yi + this.height / 2;
        var cz = this.zi + this.depth / 2;
        // a bala em si: branca na frente, com a parte de trás na cor de quem atirou
        pincel.caixa(cx + dx * 2.5 - 4.5, this.yi, cz + dz * 2.5 - 3, 9, 6, 6, CORES.texto, MATERIAL.BRILHO, giro);
        pincel.caixa(cx - dx * 4.5 - 2.5, this.yi + 0.5, cz - dz * 4.5 - 2.5, 5, 5, 5, this.color, MATERIAL.BRILHO, giro);
        pincel.brilho(cx, cy, cz, 20, this.color, 0.9);
        // rastro: três brilhos cada vez menores nos lugares por onde ela passou
        for (var i = 1; i < 4; i++) {
            var rx = this.rastroX[i] + (this.rastroX[i - 1] - this.rastroX[i]) * alfa;
            var rz = this.rastroZ[i] + (this.rastroZ[i - 1] - this.rastroZ[i]) * alfa;
            pincel.brilho(rx, cy, rz, 15 - i * 3, this.color, 0.6 - i * 0.15);
        }
    }
}

/* --------------------------- Pistoleiro -------------------------- */

// Quanto de branco misturar na cor de quem levou o tiro, "tempo" passos
// depois do acerto (o alvo pisca do mesmo jeito). São duas piscadas
// rápidas, a segunda mais fraca, e nunca branco puro: com branco = 1 o
// boneco virava um lençol chapado, sem forma, sem cores e sem luz.
function brancoDoPisca(tempo) {
    if (tempo >= 12 || tempo % 6 >= 3) {
        return 0;
    }
    return (tempo < 6) ? 0.5 : 0.35;
}

// Monta a lista de cubinhos de uma pose do boneco 3D (POSES_PISTOLEIRO, em
// sprites.js) no formato de pincel.criaMalhaVoxels(): [x, y, z, cor]. O
// jogador da direita (lado -1) é o mesmo boneco girado meia volta: x e z
// trocam de sinal. Girado, e não espelhado: no espelho ele trocaria de mão.
// Roda só no começo do jogo, uma vez para cada pose.
function voxelsDoPistoleiro(pose, paleta, lado) {
    var lista = [];
    var grupos = POSES_PISTOLEIRO[pose];
    for (var g = 0; g < grupos.length; g++) {
        var pecas = grupos[g][0];
        var frente = grupos[g][1];
        var cima = grupos[g][2];
        for (var p = 0; p < pecas.length; p++) {
            var peca = pecas[p];
            var cor = paleta[peca[0]];
            for (var x = peca[1]; x <= peca[2]; x++) {
                for (var y = peca[3]; y <= peca[4]; y++) {
                    for (var z = peca[5]; z <= peca[6]; z++) {
                        lista.push([lado * (x + frente), y + cima, lado * z, cor]);
                    }
                }
            }
        }
    }
    return lista;
}

// Onde o boneco tem cubinhos na altura em que a bala voa, visto de cima:
// uma tabelinha de 17 x 13 casas (de -8 a 8 cubinhos para a frente e para
// trás, de -6 a 6 para os lados), montada uma vez para cada pose. Com ela
// o foiAtingido() confere o tiro cubinho a cubinho sem criar nada durante
// a partida.
var GRADE_X = 8;
var GRADE_Z = 6;

function faixaDaBala(voxels, yBala, alturaBala) {
    var colunas = 2 * GRADE_X + 1;
    var tabela = new Uint8Array(colunas * (2 * GRADE_Z + 1));
    // camadas de cubinhos que a bala cobre (a 70, com 6 de altura, só a y = 10)
    var camada1 = Math.floor(yBala / PIXEL_A);
    var camada2 = Math.ceil((yBala + alturaBala) / PIXEL_A) - 1;
    for (var i = 0; i < voxels.length; i++) {
        var v = voxels[i];
        if (v[1] >= camada1 && v[1] <= camada2 && Math.abs(v[0]) <= GRADE_X && Math.abs(v[2]) <= GRADE_Z) {
            tabela[(v[2] + GRADE_Z) * colunas + v[0] + GRADE_X] = 1;
        }
    }
    return tabela;
}

// Os dois pistoleiros ficam de frente um para o outro e são canhotos. Na
// mira o revólver fica embaixo do olho esquerdo, 1 cubinho (7) para o lado
// do meio do corpo, e a bala nasce ali, na boca do cano. O jogador 2 é o
// boneco do jogador 1 girado meia volta, então o tiro reto do laranja sai
// um pouquinho para o fundo e o do vermelho um pouquinho para a frente:
// se a bala reta de um pega o outro, a do outro também pega o primeiro, e
// os dois continuam com as mesmas chances. (Com o boneco espelhado as duas
// armas ficariam do mesmo lado, e um poderia parar onde acerta sem ser
// acertado.) A arma fica perto do meio do corpo, como as balas do jogo de
// antes: mais para o lado, o tiro do alvo chegaria rente à cerca, longe da
// tábua, e com a mão direita o tiro do laranja na diagonal para a frente
// pegaria nas palmas do cacto, onde antes passava entre elas.
class Pistoleiro extends Obj {
    // malhas de voxels já montadas, uma para cada lado + cor + quadro
    static malhas = new Map();

    dirX = 0;               // -1, 0 ou 1
    dirZ = 0;               // -1 = para o fundo, 1 = para a frente
    mira = 0;               // -1 diagonal para o fundo, 0 reto, 1 diagonal para a frente
    estado = "parado";      // parado, andando, mirando, atirou, atingido, vitoria
    pontos = 0;
    municao = 6;
    velocidade = 3;
    gatilho = false;        // true enquanto a tecla de tiro está apertada
    semDirecao = 0;         // há quantos quadros a mira está sem tecla de fundo/frente
    tempoAtingido = 0;
    giro = 0;               // para onde o corpo está virado (radianos)
    giroAnt = 0;
    malhasDoQuadro = {};
    faixasDoQuadro = {};    // tabela da altura da bala de cada quadro (veja faixaDaBala)
    saidaX = 0;             // onde a bala nasce, logo na frente da boca do
    saidaZ = 0;             // cano, contando do meio do corpo (sem o giro)
    somTiro = null;         // cada um tem o barulho do seu revólver e
    somPasso = null;        // das suas botas (os dois Som ficam no jogo.js)

    // lado: 1 = fica na esquerda e olha para a direita; -1 = o contrário
    constructor(x, z, color, corEscura, lado, nome, teclas) {
        // a caixa de colisão é só o corpo: 8 cubinhos de largura (sem o
        // braço esticado da mira) e, de um braço ao outro, PROF_PISTOLEIRO
        super(x, 0, z, 8 * PIXEL_L, 18 * PIXEL_A, PROF_PISTOLEIRO, color);
        this.lado = lado;
        this.nome = nome;
        this.teclas = teclas;
        this.xInicial = x;
        this.zInicial = z;
        this.paleta = {
            C: color, E: corEscura, P: CORES.pele, A: CORES.arma,
            L: CORES.couro, F: CORES.destaque, O: CORES.cabelo
        };
        this.bala = new Bala(color);
        this.limiteEsquerda = CAMPO.esquerda;
        this.limiteDireita = CAMPO.direita - this.width;
        this.preparaFormas();
    }

    // Lê a forma de cada pose do boneco 3D. Não precisa de WebGL: guarda a
    // tabela da altura da bala para o foiAtingido() e, na pose da mira,
    // onde fica a boca do cano para o atira().
    preparaFormas() {
        for (var nome in POSES_PISTOLEIRO) {
            var voxels = voxelsDoPistoleiro(nome, this.paleta, this.lado);
            this.faixasDoQuadro[nome] = faixaDaBala(voxels, ALTURA_DA_BALA, this.bala.height);
            if (nome === "miraReta") {
                this.achaBocaDoCano(voxels);
            }
        }
    }

    // A boca do cano é o cubinho da arma, na altura da bala, que fica mais
    // à frente. A bala nasce encostada nela: o centro fica meia bala adiante.
    achaBocaDoCano(voxels) {
        var camada = Math.floor(ALTURA_DA_BALA / PIXEL_A);
        var boca = null;
        for (var i = 0; i < voxels.length; i++) {
            var v = voxels[i];
            if (v[3] === this.paleta.A && v[1] === camada && (boca === null || v[0] * this.lado > boca[0] * this.lado)) {
                boca = v;
            }
        }
        if (boca !== null) {
            this.saidaX = (boca[0] + this.lado / 2) * PIXEL_L + this.lado * this.bala.width / 2;
            this.saidaZ = boca[2] * PIXEL_L;
        }
    }

    // Monta (uma vez só) os bonecos de voxels de todas as poses. O da
    // direita é o mesmo boneco, já girado meia volta.
    preparaMalhas() {
        for (var nome in POSES_PISTOLEIRO) {
            var chave = this.lado + "|" + this.color + "|" + this.paleta.E + "|" + nome;
            var malha = Pistoleiro.malhas.get(chave);
            if (!malha) {
                // meio cubinho para trás em x e em z: assim o cubinho (0, 0, 0)
                // fica com o meio dele no meio da caixa de colisão
                malha = pincel.criaMalhaVoxels(voxelsDoPistoleiro(nome, this.paleta, this.lado), PIXEL_L,
                    [-PIXEL_L / 2, 0, -PIXEL_L / 2]);
                Pistoleiro.malhas.set(chave, malha);
            }
            this.malhasDoQuadro[nome] = malha;
        }
    }

    // usado pela página (site.js) para fotografar os retratos
    malhaDoQuadro(nomeDoQuadro) {
        if (!this.malhasDoQuadro[nomeDoQuadro]) {
            this.preparaMalhas();
        }
        return this.malhasDoQuadro[nomeDoQuadro] || null;
    }

    // Cada pistoleiro só anda no seu lado do campo, entre a moldura e o
    // obstáculo. A folga deixa espaço para o braço estendido e para a bala.
    defineLimites(obstaculo) {
        var folga = 5 * PIXEL_L;
        if (this.lado === 1) {
            this.limiteEsquerda = CAMPO.esquerda + PIXEL_L;
            this.limiteDireita = obstaculo.x - folga - this.width;
        } else {
            this.limiteEsquerda = obstaculo.x + obstaculo.width + folga;
            this.limiteDireita = CAMPO.direita - PIXEL_L - this.width;
        }
    }

    // Além da posição, guarda para onde o corpo estava virado. O corpo gira
    // depressa (mas não de uma vez) para a diagonal em que vai atirar. Na
    // vitória ele deixa de olhar para o rival e se vira para a câmera (a
    // plateia) para comemorar: a câmera do fim fica na frente da rua, e de
    // perfil não dava para ver a festa.
    guardaPosicao() {
        super.guardaPosicao();
        this.giroAnt = this.giro;
        var giroDesejado = 0;
        if (this.estado === "mirando" || this.estado === "atirou") {
            giroDesejado = -this.mira * this.lado * ANGULO_MIRA;
        } else if (this.estado === "vitoria") {
            giroDesejado = -this.lado * GIRO_DA_VITORIA;
        }
        this.giro += (giroDesejado - this.giro) * 0.5;
    }

    move() {
        this.x += this.dirX * this.velocidade;
        this.z += this.dirZ * this.velocidade;

        // limites do campo
        if (this.x < this.limiteEsquerda) { this.x = this.limiteEsquerda; }
        if (this.x > this.limiteDireita) { this.x = this.limiteDireita; }
        if (this.z < CAMPO.fundo) { this.z = CAMPO.fundo; }
        if (this.z > CAMPO.frente - PROF_PISTOLEIRO) { this.z = CAMPO.frente - PROF_PISTOLEIRO; }

        if (this.dirX !== 0 || this.dirZ !== 0) {
            this.estado = "andando";
            this.animation(2, 7);
        } else {
            this.estado = "parado";
        }
    }

    podeAtirar(seisBalas) {
        if (this.bala.ativa) { return false; }              // uma bala de cada vez
        if (seisBalas && this.municao <= 0) { return false; }
        return true;
    }

    // A bala nasce na boca do cano, onde ele está desenhado: ao lado do
    // meio do corpo (veja o comentário antes da classe) e girada junto com
    // o corpo, que fica virado para a diagonal escolhida.
    atira() {
        var giro = -this.mira * this.lado * ANGULO_MIRA;
        var cos = Math.cos(giro);
        var sen = Math.sin(giro);
        var cx = this.x + this.width / 2;
        var cz = this.z + this.depth / 2;
        this.bala.dispara(cx + this.saidaX * cos + this.saidaZ * sen, cz - this.saidaX * sen + this.saidaZ * cos,
            this.lado, this.mira);
        // Sem "seis balas" a munição não vale nada (o jogo nem mostra), mas
        // também não precisa ficar negativa. Com a regra ligada só dá para
        // atirar com bala no tambor, então nada muda.
        if (this.municao > 0) {
            this.municao -= 1;
        }
    }

    // qual desenho usar agora
    quadro() {
        if (this.estado === "atingido") { return "atingido"; }
        if (this.estado === "vitoria") { return "vitoria"; }
        // reto ou na diagonal, o braço fica estendido: quem aponta para a
        // diagonal é o corpo inteiro, que gira (veja guardaPosicao)
        if (this.estado === "mirando" || this.estado === "atirou") {
            return "miraReta";
        }
        if (this.estado === "andando") {
            return this.frame === 1 ? "passo1" : "passo2";
        }
        return "parado";
    }

    // sobrescreve o desenha() da classe Obj: em vez de uma caixa, o boneco de voxels
    desenha(alfa) {
        this.interpola(alfa);
        var cx = this.xi + this.width / 2;
        var cz = this.zi + this.depth / 2;
        // um pulinho a cada passo, e pulos maiores de alegria na vitória
        var pulo = 0;
        if (this.estado === "andando") {
            pulo = Math.abs(Math.sin(this.fase * Math.PI * 2)) * 2;
        } else if (this.estado === "vitoria") {
            pulo = Math.abs(Math.sin(this.fase * Math.PI)) * 9;
        }
        // pisca no instante em que leva o tiro
        var branco = (this.estado === "atingido") ? brancoDoPisca(this.tempoAtingido) : 0;
        var giro = this.giroAnt + (this.giro - this.giroAnt) * alfa;
        var malha = this.malhasDoQuadro[this.quadro()];
        if (malha) {
            pincel.malha(malha, cx, this.yi + pulo, cz, giro, branco);
        }
        pincel.sombraRedonda(cx, cz, 30, 0.5);
    }

    // Primeiro testa a caixa (collide da classe Obj) e depois confere
    // cubinho a cubinho, como o Atari fazia pixel a pixel: na altura da
    // bala, o boneco desenhado precisa ter um cubinho onde a bala passa.
    // A conta é feita "de dentro" do boneco: o centro da bala gira ao
    // contrário do corpo (o giro da mira), e a bala, que é uma caixa
    // alinhada com a rua, vira um retângulo inclinado. Ele encosta num
    // cubinho quando nenhum dos quatro lados dos dois separa um do outro.
    foiAtingido(bala) {
        if (!bala.ativa || this.estado === "atingido" || !this.collide(bala)) {
            return false;
        }
        var faixa = this.faixasDoQuadro[this.quadro()];
        var cos = Math.cos(this.giro);
        var sen = Math.sin(this.giro);
        var dx = bala.x + bala.width / 2 - (this.x + this.width / 2);
        var dz = bala.z + bala.depth / 2 - (this.z + this.depth / 2);
        var bx = dx * cos - dz * sen;           // centro da bala nos eixos do boneco
        var bz = dx * sen + dz * cos;
        var meiaL = bala.width / 2;             // metade da bala ao longo da rua
        var meiaP = bala.depth / 2;             // e de través
        var c = Math.abs(cos);
        var s = Math.abs(sen);
        var alcanceX = meiaL * c + meiaP * s;   // metade da bala medida nos eixos do boneco
        var alcanceZ = meiaL * s + meiaP * c;
        var meio = PIXEL_L / 2;                 // metade de um cubinho
        var raio = meio * (c + s);              // e medida nos eixos da bala
        var colunas = 2 * GRADE_X + 1;
        var x1 = Math.max(Math.floor((bx - alcanceX + meio) / PIXEL_L), -GRADE_X);
        var x2 = Math.min(Math.floor((bx + alcanceX + meio) / PIXEL_L), GRADE_X);
        var z1 = Math.max(Math.floor((bz - alcanceZ + meio) / PIXEL_L), -GRADE_Z);
        var z2 = Math.min(Math.floor((bz + alcanceZ + meio) / PIXEL_L), GRADE_Z);
        for (var iz = z1; iz <= z2; iz++) {
            for (var ix = x1; ix <= x2; ix++) {
                if (faixa[(iz + GRADE_Z) * colunas + ix + GRADE_X] === 0) {
                    continue;
                }
                var qx = ix * PIXEL_L - bx;         // meio do cubinho visto do meio da bala
                var qz = iz * PIXEL_L - bz;
                if (Math.abs(qx) < meio + alcanceX && Math.abs(qz) < meio + alcanceZ &&
                    Math.abs(qx * cos + qz * sen) < meiaL + raio &&
                    Math.abs(qz * cos - qx * sen) < meiaP + raio) {
                    return true;
                }
            }
        }
        return false;
    }

    levaTiro() {
        this.estado = "atingido";
        this.tempoAtingido = 0;
        this.dirX = 0;
        this.dirZ = 0;
    }

    // volta para a posição de início do duelo
    reinicia() {
        this.x = this.xInicial;
        this.z = this.zInicial;
        this.dirX = 0;
        this.dirZ = 0;
        this.mira = 0;
        this.estado = "parado";
        this.gatilho = false;
        this.municao = 6;
        this.bala.ativa = false;
        this.guardaPosicao();
        this.giro = 0;
        this.giroAnt = 0;
    }
}

/* ------------------------------ Alvo ----------------------------- */

// Alvo do modo de um jogador: uma tábua redonda pendurada num carrinho que
// corre embaixo de uma trave, indo e voltando sem parar entre o fundo e a
// frente do lado direito. A trave fica presa em dois postes fora do campo,
// à direita, cada um com um braço que passa por cima da rua: assim nenhum
// poste fica na frente da câmera.
// De frente para o atirador, a tábua aparecia de lado para as câmeras (que
// olham do meio da rua) e virava um risquinho. Por isso ela fica virada na
// diagonal, para o atirador e para a câmera ao mesmo tempo, e é mais grossa.
var GIRO_DO_ALVO = 0.5;                 // radianos (uns 29 graus) da esquerda para a frente
var SENO_DO_ALVO = Math.sin(GIRO_DO_ALVO);
var COSSENO_DO_ALVO = Math.cos(GIRO_DO_ALVO);
var LADO_DO_ALVO = 8 * PIXEL_L;         // largura da tábua: as 8 colunas do desenho
var GROSSURA_DO_ALVO = 3 * PIXEL_L;     // duas camadas pintadas e uma de madeira atrás
var ALTURA_DA_TRAVE = 170;              // de onde a tábua fica pendurada
var X_DOS_POSTES = 930;                 // fora do campo, depois da moldura da direita
var Z_POSTE_FUNDO = -34;                // na calçada, atrás da cerca
var Z_POSTE_FRENTE = 510;               // na rua, longe o bastante do corrimão para o braço não encostar na tábua

class Alvo extends Obj {
    static malha = null;
    dirZ = 1;
    velocidade = 3;
    tempoAtingido = 99;

    // x, z = canto da tábua fina do 2D (2 cubinhos de grossura, de frente
    // para o atirador), que é o que o jogo.js passa: o meio da tábua fica em
    // x + PIXEL_L, onde estaria o meio do jogador 2. A caixa de colisão é a
    // que cobre a tábua já virada (vista de cima, um retângulo girado cabe
    // numa caixa um pouco maior); foiAtingido() faz a conta exata.
    constructor(x, z) {
        var largura = LADO_DO_ALVO * SENO_DO_ALVO + GROSSURA_DO_ALVO * COSSENO_DO_ALVO;
        var profundidade = LADO_DO_ALVO * COSSENO_DO_ALVO + GROSSURA_DO_ALVO * SENO_DO_ALVO;
        super(x + PIXEL_L - largura / 2, 40, z, largura, 12 * PIXEL_A, profundidade, CORES.jogador2);
        this.zInicial = z;
        this.paleta = { V: CORES.jogador2, B: CORES.texto };
        this.malha = null;
    }

    // A tábua é a mesma matriz do alvo 2D, em pé: as colunas viram a largura
    // da tábua. A frente pintada (lado do atirador, x negativo) tem duas
    // camadas e atrás vai uma de madeira. A malha fica centrada no (0, 0),
    // para girar em volta do meio da tábua.
    preparaMalha() {
        if (!Alvo.malha) {
            var lista = [];
            var linhas = MATRIZ_ALVO.length;
            var colunas = MATRIZ_ALVO[0].length;
            for (var l = 0; l < linhas; l++) {
                for (var c = 0; c < colunas; c++) {
                    var letra = MATRIZ_ALVO[l][c];
                    if (letra === ".") {
                        continue;
                    }
                    var iy = linhas - 1 - l;
                    var iz = c - colunas / 2;
                    lista.push([-1, iy, iz, this.paleta[letra]]);
                    lista.push([0, iy, iz, this.paleta[letra]]);
                    lista.push([1, iy, iz, "#6e4a2c"]);
                }
            }
            Alvo.malha = pincel.criaMalhaVoxels(lista, PIXEL_L, [-PIXEL_L / 2, 0, 0]);
        }
        this.malha = Alvo.malha;
    }

    move() {
        this.z += this.dirZ * this.velocidade;
        if (this.z < CAMPO.fundo) {
            this.z = CAMPO.fundo;
            this.dirZ = 1;
        }
        if (this.z > CAMPO.frente - this.depth) {
            this.z = CAMPO.frente - this.depth;
            this.dirZ = -1;
        }
        this.tempoAtingido += 1;
    }

    desenha(alfa) {
        this.interpola(alfa);
        var cx = this.xi + this.width / 2;
        var cz = this.zi + this.depth / 2;
        // pisca logo depois de ser acertado (igual ao pistoleiro)
        if (this.malha) {
            pincel.malha(this.malha, cx, this.yi, cz, GIRO_DO_ALVO, brancoDoPisca(this.tempoAtingido));
        }
        this.desenhaTrave(cx, cz);
        pincel.sombraRedonda(cx, cz, 28, 0.3);
    }

    // Os postes, a trave e o carrinho com as duas cordinhas que seguram a
    // tábua (cx, cz = meio da tábua neste quadro). Só a trave atravessa o
    // campo, lá em cima; os postes ficam fora dele.
    desenhaTrave(cx, cz) {
        var M = MATERIAL;
        var madeira = "#5c3a22";
        var corda = "#cdb98a";
        var h = ALTURA_DA_TRAVE;
        var topo = this.y + this.height;
        pincel.caixa(X_DOS_POSTES - 5, 0, Z_POSTE_FUNDO - 5, 10, h + 15, 10, madeira, M.MADEIRA, 0);
        pincel.caixa(X_DOS_POSTES - 5, 0, Z_POSTE_FRENTE - 5, 10, h + 15, 10, madeira, M.MADEIRA, 0);
        pincel.caixa(cx - 8, h + 7, Z_POSTE_FUNDO - 4, X_DOS_POSTES - cx + 13, 8, 8, madeira, M.MADEIRA, 0);
        pincel.caixa(cx - 8, h + 7, Z_POSTE_FRENTE - 4, X_DOS_POSTES - cx + 13, 8, 8, madeira, M.MADEIRA, 0);
        pincel.caixa(cx - 3, h, Z_POSTE_FUNDO - 4, 6, 7, Z_POSTE_FRENTE - Z_POSTE_FUNDO + 8, madeira, M.MADEIRA, 0);
        // o carrinho corre embaixo da trave; as cordinhas descem até a
        // tábua nos dois lados do meio dela (a tábua está girada)
        pincel.caixa(cx - 9, h - 10, cz - 13, 18, 10, 26, "#2b2a30", M.LISO, 0);
        var dx = SENO_DO_ALVO * 12;
        var dz = COSSENO_DO_ALVO * 12;
        pincel.caixa(cx + dx - 1, topo, cz + dz - 1, 2, h - 10 - topo, 2, corda, M.LISO, 0);
        pincel.caixa(cx - dx - 1, topo, cz - dz - 1, 2, h - 10 - topo, 2, corda, M.LISO, 0);
    }

    // Mesmos nomes de método do Pistoleiro: o jogo trata os dois do mesmo
    // jeito. Primeiro a caixa (collide da classe Obj), depois a conta
    // exata: nos eixos da própria tábua (largura e grossura), a caixa da
    // bala precisa encostar no retângulo da tábua girada.
    foiAtingido(bala) {
        if (!bala.ativa || !this.collide(bala)) {
            return false;
        }
        var dx = bala.x + bala.width / 2 - (this.x + this.width / 2);
        var dz = bala.z + bala.depth / 2 - (this.z + this.depth / 2);
        var naLargura = dx * SENO_DO_ALVO + dz * COSSENO_DO_ALVO;
        var naGrossura = dx * COSSENO_DO_ALVO - dz * SENO_DO_ALVO;
        // metade da bala medida em cada eixo da tábua
        var meiaX = bala.width / 2;
        var meiaZ = bala.depth / 2;
        var folgaLargura = meiaX * SENO_DO_ALVO + meiaZ * COSSENO_DO_ALVO;
        var folgaGrossura = meiaX * COSSENO_DO_ALVO + meiaZ * SENO_DO_ALVO;
        return Math.abs(naLargura) <= LADO_DO_ALVO / 2 + folgaLargura &&
            Math.abs(naGrossura) <= GROSSURA_DO_ALVO / 2 + folgaGrossura;
    }

    levaTiro() {
        this.tempoAtingido = 0;
    }

    reinicia() {
        this.z = this.zInicial;
        this.dirZ = 1;
        this.tempoAtingido = 99;
        this.guardaPosicao();
    }
}

/* --------------------------- Obstaculo --------------------------- */

// Aro da roda da diligência feito de caixas: para cada faixa de altura,
// os pedaços do círculo que ficam entre o raio de fora e o de dentro.
// Cada parte é [y, altura, z, profundidade], com z a partir do centro.
function montaRoda(raio, raioDentro, faixa) {
    var partes = [];
    for (var y = 0; y < 2 * raio; y += faixa) {
        var dy = y + faixa / 2 - raio;
        var fora = Math.sqrt(raio * raio - dy * dy);
        var dentro = (raioDentro * raioDentro > dy * dy) ? Math.sqrt(raioDentro * raioDentro - dy * dy) : 0;
        if (dentro <= 0) {
            partes.push([y, faixa, -fora, 2 * fora]);
        } else {
            partes.push([y, faixa, -fora, fora - dentro]);
            partes.push([y, faixa, dentro, fora - dentro]);
        }
    }
    return partes;
}

var RODA = montaRoda(40, 33, 8);
var RODA_PEQUENA = montaRoda(30, 25, 6);    // rodas da carroça do cenário

// Jeitos de o muro quebrar em volta de um buraco. Cada um diz onde acaba
// a parte inteira de baixo, a altura dos dois primeiros degraus (sempre em
// fiadas de tijolo, de 11 em 11) e quanto cada um dos três degraus recua
// da beirada quebrada: [baixo, degrau1, degrau2, recuo1, recuo2, recuo3].
var QUEBRAS_MURO = [
    [88, 110, 132, 3, 9, 15],
    [99, 121, 143, 6, 11, 17],
    [88, 121, 132, 2, 12, 14],
    [99, 110, 143, 5, 8, 13],
    [88, 99, 132, 4, 9, 18],
    [99, 132, 143, 7, 10, 12]
];

// O obstáculo é uma grade de blocos deitada no chão, que ocupa a
// profundidade toda do campo (LINHAS_CAMPO linhas). Quando é móvel, a
// grade rola para o fundo e o que sai por lá volta pela frente.
class Obstaculo extends Obj {
    movel = false;
    rolagem = 0;            // quanto a grade já rolou
    rolagemAnt = 0;
    velocidade = 2;
    // quanto as peças de uma linha passam da casa dela, para o fundo ou
    // para a frente (a cabeça do cavalo, a roda, o varal); veja desenha()
    sobra = 0;

    // desenho: matriz de blocos (sprites.js)
    // linhaInicial: em qual das 18 linhas do campo o desenho começa
    // paleta: cores do cenário (sprites.js) - a cidade muda junto com o obstáculo
    constructor(nome, desenho, linhaInicial, paleta) {
        var width = desenho[0].length * BLOCO_L;
        super((LARGURA - width) / 2, 0, CAMPO.fundo, width, 240, LINHAS_CAMPO * BLOCO_P, paleta.bloco);
        this.nome = nome;
        this.desenho = desenho;
        this.linhaInicial = linhaInicial;
        this.paleta = paleta;
        this.corSombra = paleta.sombra;
        this.corCampo = paleta.campo;
        this.colunas = desenho[0].length;
        // a grade é criada uma vez só; restaura() só preenche de novo
        this.blocos = [];
        this.demolido = [];
        for (var l = 0; l < LINHAS_CAMPO; l++) {
            this.blocos.push(new Array(this.colunas));
            this.demolido.push(new Array(this.colunas));
        }
        this.restaura();
    }

    // letra do desenho original naquela casa ("." fora do desenho)
    tipoOriginal(l, c) {
        var texto = this.desenho[l - this.linhaInicial];    // fora do desenho dá undefined
        return (texto !== undefined) ? texto[c] : ".";
    }

    // reconstrói a grade inteira, sem nenhum estrago
    restaura() {
        for (var l = 0; l < LINHAS_CAMPO; l++) {
            for (var c = 0; c < this.colunas; c++) {
                this.blocos[l][c] = this.tipoOriginal(l, c);
                this.demolido[l][c] = false;
            }
        }
        this.rolagem = 0;
        this.rolagemAnt = 0;
    }

    guardaPosicao() {
        super.guardaPosicao();
        this.rolagemAnt = this.rolagem;
    }

    move() {
        if (!this.movel) {
            return;
        }
        this.rolagem += this.velocidade;
        if (this.rolagem >= this.depth) {
            this.rolagem -= this.depth;
        }
    }

    // qual linha da grade está passando agora na profundidade z
    linhaEm(z) {
        var l = Math.floor((z - this.z + this.rolagem) / BLOCO_P) % LINHAS_CAMPO;
        return (l < 0) ? l + LINHAS_CAMPO : l;
    }

    // só as letras maiúsculas param a bala
    bloqueia(tipo) {
        return tipo >= "A" && tipo <= "Z";
    }

    // a casa ainda tem o bloco inteiro?
    intacto(l, c) {
        if (l < 0 || l >= LINHAS_CAMPO || c < 0 || c >= this.colunas) {
            return false;
        }
        return this.blocos[l][c] !== ".";
    }

    // a casa foi arrancada pela demolição? (fora da grade nunca foi)
    arrancado(l, c) {
        if (c < 0 || c >= this.colunas) {
            return false;
        }
        if (this.movel) {
            // rolando, a última linha encosta na primeira
            l = (l + LINHAS_CAMPO) % LINHAS_CAMPO;
        } else if (l < 0 || l >= LINHAS_CAMPO) {
            return false;
        }
        return this.demolido[l][c];
    }

    // Devolve true se a bala bateu em algum bloco. Com "demolicao" ligada
    // o bloco atingido é arrancado e fica só o que sobrou dele.
    acerta(bala, demolicao) {
        if (!bala.ativa || !this.collide(bala)) {
            return false;
        }
        var c1 = Math.max(Math.floor((bala.x - this.x) / BLOCO_L), 0);
        var c2 = Math.min(Math.floor((bala.x + bala.width - 1 - this.x) / BLOCO_L), this.colunas - 1);
        // a bala é fininha: basta testar a linha da frente e a de trás dela
        var linhaA = this.linhaEm(bala.z);
        var linhaB = this.linhaEm(bala.z + bala.depth - 1);
        for (var i = 0; i < 2; i++) {
            var l = (i === 0) ? linhaA : linhaB;
            for (var c = c1; c <= c2; c++) {
                if (this.bloqueia(this.blocos[l][c])) {
                    if (demolicao) {
                        this.blocos[l][c] = ".";
                        this.demolido[l][c] = true;
                    }
                    return true;
                }
            }
            if (linhaB === linhaA) {
                break;
            }
        }
        return false;
    }

    // Desenha a grade recortada no campo: o motor achata contra a borda o
    // que passa do fundo ou da frente. Quando a grade rola, ela é um anel:
    // o que sai pelo fundo entra de novo pela frente. Uma linha que está
    // cruzando uma das bordas é desenhada nas duas pontas, e a "sobra"
    // conta as peças que passam da casa: sem ela a cabeça do cavalo, que
    // fica fora da casa dela, surgiria inteira de repente na frente.
    desenha(alfa) {
        var r = this.rolagem;
        if (this.movel) {
            var antes = this.rolagemAnt;
            if (r < antes) {
                antes -= this.depth;        // deu a volta neste passo
            }
            r = antes + (r - antes) * alfa;
            if (r < 0) {
                r += this.depth;
            }
        }
        var sobra = this.sobra;
        pincel.recorteZ(CAMPO.fundo, CAMPO.frente);
        for (var l = 0; l < LINHAS_CAMPO; l++) {
            var z0 = this.z + l * BLOCO_P - r;
            if (z0 + BLOCO_P + sobra > CAMPO.fundo) {
                this.desenhaLinha(l, z0);
            }
            if (this.movel) {
                // a parte que passou do fundo aparece na frente...
                if (z0 - sobra < CAMPO.fundo) {
                    this.desenhaLinha(l, z0 + this.depth);
                }
                // ...e a que passa da frente aparece no fundo
                if (z0 + BLOCO_P + sobra > CAMPO.frente) {
                    this.desenhaLinha(l, z0 - this.depth);
                }
            }
        }
        pincel.semRecorte();
    }

    desenhaLinha(l, z) {
        for (var c = 0; c < this.colunas; c++) {
            var tipo = this.blocos[l][c];
            if (tipo !== ".") {
                this.desenhaBloco(this.x + c * BLOCO_L, z, l, c, tipo, true);
            } else if (this.demolido[l][c]) {
                this.desenhaBloco(this.x + c * BLOCO_L, z, l, c, this.tipoOriginal(l, c), false);
            }
        }
    }

    // Põe uma caixa do obstáculo na fila, mas só se alguma parte dela
    // estiver dentro do campo (o motor recorta as que passam da borda,
    // não as que ficam inteiras do lado de fora).
    bloco(x, y, z, l, a, p, cor, material, rotY) {
        var meio = p / 2;
        if (rotY) {
            meio = Math.abs(Math.sin(rotY)) * l / 2 + Math.abs(Math.cos(rotY)) * p / 2;
        }
        var centro = z + p / 2;
        if (centro + meio <= CAMPO.fundo || centro - meio >= CAMPO.frente) {
            return;
        }
        pincel.caixa(x, y, z, l, a, p, cor, material, rotY || 0);
    }

    // Cada casa da grade desenha as suas caixas. As classes filhas trocam
    // este método pelo desenho delas. intacto = false é o que sobrou de
    // um bloco arrancado pela demolição.
    desenhaBloco(x, z, l, c, tipo, intacto) {
        if (!intacto) {
            this.bloco(x, 0, z, BLOCO_L, 16, BLOCO_P, this.color, MATERIAL.LISO);
            return;
        }
        this.bloco(x, 0, z, BLOCO_L, 140, BLOCO_P, this.color, MATERIAL.LISO);
        this.bloco(x, 140, z, BLOCO_L, 6, BLOCO_P, this.corSombra, MATERIAL.LISO);
    }
}

class Cacto extends Obstaculo {
    constructor() {
        super("CACTO", MATRIZ_CACTO, 5, PALETAS.cacto);
    }

    // sobrescreve move(): o cacto tem raiz, nunca sai do lugar
    move() {
    }

    // o tronco é feito das casas T vizinhas
    ehTronco(l, c) {
        return this.intacto(l, c) && this.blocos[l][c] === "T";
    }

    desenhaBloco(x, z, l, c, tipo, intacto) {
        var M = MATERIAL;
        var linha = l - this.linhaInicial;      // linha dentro do desenho do cacto
        if (tipo === "T") {
            if (!intacto) {
                // toco: o que sobra do tronco depois do tiro
                this.bloco(x, 0, z, BLOCO_L, 20, BLOCO_P, this.color, M.CACTO);
                this.bloco(x + 3, 20, z + 3, BLOCO_L - 6, 2, BLOCO_P - 6, this.corSombra, M.LISO);
                return;
            }
            this.bloco(x, 0, z, BLOCO_L, 230, BLOCO_P, this.color, M.CACTO);
            // topo arredondado: encolhe nos lados que não têm outro pedaço de tronco
            var x1 = x + (this.ehTronco(l, c - 1) ? 0 : 4);
            var x2 = x + BLOCO_L - (this.ehTronco(l, c + 1) ? 0 : 4);
            var z1 = z + (this.ehTronco(l - 1, c) ? 0 : 4);
            var z2 = z + BLOCO_P - (this.ehTronco(l + 1, c) ? 0 : 4);
            this.bloco(x1, 230, z1, x2 - x1, 7, z2 - z1, this.color, M.CACTO);
            this.bloco(x1 + (x1 > x ? 5 : 0), 237, z1 + (z1 > z ? 5 : 0), x2 - x1 - 5, 4, z2 - z1 - 5, this.color, M.CACTO);
            // os dois braços do saguaro, lá no alto (a bala passa por baixo)
            if (linha === 3 && c === 2) {
                this.bloco(x - 30, 116, z + 3, 34, 20, 18, this.color, M.CACTO);
                this.bloco(x - 30, 116, z + 3, 20, 94, 18, this.color, M.CACTO);
                this.bloco(x - 27, 210, z + 6, 14, 5, 12, this.color, M.CACTO);
            }
            if (linha === 4 && c === 3) {
                this.bloco(x + 18, 140, z + 3, 34, 20, 18, this.color, M.CACTO);
                this.bloco(x + 32, 140, z + 3, 20, 92, 18, this.color, M.CACTO);
                this.bloco(x + 35, 232, z + 6, 14, 5, 12, this.color, M.CACTO);
            }
            return;
        }
        if (tipo === "P") {
            // palma: raquetes achatadas, cada uma num ângulo, com uma flor no alto
            var semente = (l * 7 + c * 13) % 5;
            var giro = (semente - 2) * 0.22;
            var cx = x + BLOCO_L / 2;
            var cz = z + BLOCO_P / 2;
            if (!intacto) {
                this.raquete(cx, 0, cz, 18, 12, giro);
                return;
            }
            this.raquete(cx - 1, 0, cz, 25, 40, giro);
            this.raquete(cx + semente - 2, 40, cz + 1, 21, 32, giro + 0.35);
            this.raquete(cx + 1, 72, cz - 1, 15, 17, giro - 0.3);
            this.bloco(cx - 2, 95, cz - 3, 5, 5, 5, CORES.destaque, M.LISO);
        }
    }

    // uma raquete da palma: a placa achatada e um topo mais estreito, que a
    // deixa arredondada; as duas giram em volta do mesmo centro
    raquete(cx, y, cz, largura, altura, giro) {
        this.bloco(cx - largura / 2, y, cz - 5, largura, altura, 10, this.corSombra, MATERIAL.CACTO, giro);
        this.bloco(cx - largura * 0.35, y + altura, cz - 4, largura * 0.7, 6, 8, this.corSombra, MATERIAL.CACTO, giro);
    }
}

class Diligencia extends Obstaculo {
    // a cabeça dos cavalos e as rodas passam da casa delas, e a lança do
    // varal vai da cabine até o peito dos cavalos (veja desenha())
    sobra = 90;

    constructor() {
        super("DILIGÊNCIA", MATRIZ_DILIGENCIA, 3, PALETAS.diligencia);
        // onde ficam as janelas (j): a cabine é alta antes delas e baixa depois
        this.janelaInicio = LINHAS_CAMPO;
        this.janelaFim = -1;
        for (var l = 0; l < LINHAS_CAMPO; l++) {
            for (var c = 0; c < this.colunas; c++) {
                if (this.tipoOriginal(l, c) === "j") {
                    this.janelaInicio = Math.min(this.janelaInicio, l);
                    this.janelaFim = l;
                }
            }
        }
    }

    desenhaBloco(x, z, l, c, tipo, intacto) {
        // casa arrancada não desenha nada; a cabine deixa só o assoalho
        if (!intacto) {
            if (tipo === "C") {
                this.bloco(x, 12, z, BLOCO_L, 10, BLOCO_P, this.corSombra, MATERIAL.MADEIRA);
            }
            return;
        }
        if (tipo === "H") {
            this.cavalo(x, z, l, c);
        } else if (tipo === "b") {
            this.varal(x, z, c);
        } else if (tipo === "R") {
            this.roda(x, z, c);
        } else if (tipo === "C") {
            this.cabine(x, z, l, c);
        } else if (tipo === "j") {
            this.janela(x, z, l, c);
        }
    }

    // a casa faz parte da cabine (parede ou janela)?
    ehCabine(l, c) {
        var tipo = this.tipoOriginal(l, c);
        return tipo === "C" || tipo === "j";
    }

    // Cada par "HH" do desenho é um cavalo de 30 de largura, metade em cada
    // casa, com 4 casas de comprimento. Ele olha para o fundo: o pescoço e
    // a cabeça passam da casa da frente, e a cilha escura no lombo e o rabo
    // ajudam a ler o cavalo de cima, que é como as câmeras o veem.
    cavalo(x, z, l, c) {
        var M = MATERIAL;
        var pelo = "#8a5a33";
        var pernas = "#6e4526";
        var crina = "#3e2615";
        var casco = "#2b2a30";
        var arreio = "#2a1c14";
        var esquerda = (c % 2 === 0);               // metade esquerda do cavalo?
        var meio = esquerda ? x + BLOCO_L : x;       // o meio do cavalo fica entre as duas casas
        var lado = esquerda ? -1 : 1;
        var primeira = (this.tipoOriginal(l - 1, c) !== "H");
        var ultima = (this.tipoOriginal(l + 1, c) !== "H");
        // barriga e lombo, com o peito e a anca arredondados; a cintura é
        // mais fina que a cernelha (na frente) e a garupa (atrás)
        var z1 = z + (primeira ? 5 : 0);
        var z2 = z + BLOCO_P - (ultima ? 3 : 0);
        var largura = (primeira || ultima) ? 14 : 12;
        this.metade(meio, lado, 0, largura, 50, 38, z1, z2 - z1, pelo);
        if (primeira) {
            this.metade(meio, lado, 0, 10, 88, 6, z1 + 3, z2 - z1 - 3, pelo);           // cernelha
            this.metade(meio, lado, 6, 11, 0, 52, z + 8, 5, pernas);
            this.metade(meio, lado, 5, 12, 0, 6, z + 7, 7, casco);
            if (esquerda) {
                // pescoço erguido, cabeça, crina, orelhas e a coelheira do
                // arreio (ficam no meio do cavalo, então só a metade esquerda desenha)
                this.bloco(meio - 6, 76, z - 6, 12, 30, 16, pelo, M.LISO);
                this.bloco(meio - 6, 98, z - 15, 12, 26, 13, pelo, M.LISO);
                this.bloco(meio - 6, 110, z - 31, 12, 16, 18, pelo, M.LISO);
                this.bloco(meio - 5, 109, z - 36, 10, 10, 5, crina, M.LISO);              // focinho
                this.bloco(meio - 2, 100, z - 13, 4, 28, 19, crina, M.LISO);              // crina
                this.bloco(meio - 6, 126, z - 17, 3, 7, 3, pelo, M.LISO);                 // orelhas
                this.bloco(meio + 3, 126, z - 17, 3, 7, 3, pelo, M.LISO);
                this.bloco(meio - 8, 80, z + 5, 16, 22, 5, arreio, M.LISO);
            }
        } else if (ultima) {
            this.metade(meio, lado, 0, 11, 88, 4, z, BLOCO_P - 6, pelo);                 // garupa
            this.metade(meio, lado, 6, 11, 0, 52, z + 12, 5, pernas);
            this.metade(meio, lado, 5, 12, 0, 6, z + 11, 7, casco);
            if (esquerda) {
                this.bloco(meio - 3, 58, z + 20, 6, 34, 6, crina, M.LISO);                // rabo
            }
        } else if (this.tipoOriginal(l - 2, c) !== "H") {
            // segunda casa: a cilha passa por cima do lombo
            this.metade(meio, lado, 0, 13, 62, 30, z + 6, 6, arreio);
        }
        // tirantes: as correias do peito do cavalo até a trave do varal
        if (!primeira) {
            this.metade(meio, lado, largura, largura + 2, 66, 3, z, BLOCO_P + (ultima ? 6 : 0), arreio);
        }
    }

    // caixa de meio cavalo, de "de" até "ate" contados do meio para o lado dela
    metade(meio, lado, de, ate, y, altura, z, prof, cor) {
        this.bloco((lado < 0) ? meio - ate : meio + de, y, z, ate - de, altura, prof, cor, MATERIAL.LISO);
    }

    // varal: a lança, que sai da frente da cabine e passa entre os dois
    // cavalos até o peito deles, e a trave onde os tirantes se prendem
    varal(x, z, c) {
        var madeira = "#5c3a22";
        var esquerda = (c < this.colunas / 2);
        if (esquerda) {
            // a lança fica bem no meio da diligência: só uma das casas desenha
            this.bloco(x + BLOCO_L - 2, 56, z - 90, 4, 4, BLOCO_P + 90, madeira, MATERIAL.MADEIRA);
        }
        this.bloco(esquerda ? x - 39 : x, 62, z + 4, 61, 4, 4, madeira, MATERIAL.MADEIRA);
    }

    // roda de 80 de diâmetro em pé (plano Y-Z): aro, raios e cubo
    roda(x, z, c) {
        var M = MATERIAL;
        var cor = "#3b2a1a";
        var xr = (c === 0) ? x + 3 : x + BLOCO_L - 9;
        var cz = z + BLOCO_P / 2;
        for (var i = 0; i < RODA.length; i++) {
            var parte = RODA[i];
            this.bloco(xr, parte[0], cz + parte[2], 6, parte[1], parte[3], cor, M.MADEIRA);
        }
        this.bloco(xr + 1, 7, cz - 2, 4, 66, 4, cor, M.MADEIRA);
        this.bloco(xr + 1, 38, cz - 33, 4, 4, 66, cor, M.MADEIRA);
        for (var k = -2; k <= 2; k++) {
            if (k !== 0) {
                this.bloco(xr + 1, 38 + k * 10, cz + k * 10 - 2, 4, 4, 4, cor, M.MADEIRA);
                this.bloco(xr + 1, 38 + k * 10, cz - k * 10 - 2, 4, 4, 4, cor, M.MADEIRA);
            }
        }
        this.bloco(xr - 1, 33, cz - 7, 8, 14, 14, "#2b2a30", M.LISO);
        // eixo até a cabine
        this.bloco((c === 0) ? x + 8 : x, 37, cz - 3, BLOCO_L - 8, 6, 6, "#2b2a30", M.LISO);
    }

    // Fatia da cabine. Antes das janelas ela é alta, com teto, banco do
    // cocheiro, lampiões e bagagem; depois delas fica baixa (o encosto do
    // banco de trás e o bagageiro). As câmeras olham a diligência de trás e
    // de cima, então uma traseira alta esconderia a bala nas janelas.
    cabine(x, z, l, c) {
        var M = MATERIAL;
        var foraEsq = !this.ehCabine(l, c - 1);     // parede de fora à esquerda?
        var foraDir = !this.ehCabine(l, c + 1);
        var dentro = !foraEsq && !foraDir;
        this.bloco(x + 2, 12, z, BLOCO_L - 4, 8, BLOCO_P, "#3b2a1a", M.MADEIRA);     // chassi
        if (l < this.janelaInicio) {
            this.bloco(x, 20, z, BLOCO_L, 112, BLOCO_P, this.color, M.MADEIRA);
            // friso escuro nas laterais
            if (foraEsq) {
                this.bloco(x - 1, 70, z, 1, 6, BLOCO_P, this.corSombra, M.LISO);
            }
            if (foraDir) {
                this.bloco(x + BLOCO_L, 70, z, 1, 6, BLOCO_P, this.corSombra, M.LISO);
            }
            // o teto passa um pouco da parede dos lados e da frente
            var frente = !this.ehCabine(l - 1, c);
            this.bloco(x - (foraEsq ? 4 : 0), 132, z - (frente ? 4 : 0), BLOCO_L + (foraEsq ? 4 : 0) + (foraDir ? 4 : 0), 8,
                BLOCO_P + (frente ? 4 : 0), this.corSombra, M.LISO);
            if (frente) {
                // lampiões nos cantos e o banco do cocheiro em cima do teto
                if (foraEsq) {
                    this.bloco(x - 5, 104, z - 3, 5, 8, 5, "#ffd27a", M.BRILHO);
                }
                if (foraDir) {
                    this.bloco(x + BLOCO_L, 104, z - 3, 5, 8, 5, "#ffd27a", M.BRILHO);
                }
                if (dentro) {
                    this.bloco(x, 140, z + 2, BLOCO_L, 5, 10, "#9a3d33", M.LISO);
                    this.bloco(x, 140, z + 12, BLOCO_L, 14, 3, this.corSombra, M.LISO);
                }
            } else if (dentro) {
                // bagagem amarrada no teto
                this.bloco(x + 1, 140, z + 3, BLOCO_L - 2, 12, BLOCO_P - 6, "#7a5a3a", M.MADEIRA);
            }
            if (l === this.janelaInicio - 1) {
                // as colunas da frente da janela e, dos lados, uma janela
                // fechada de vidro escuro (acima da altura da bala)
                if (foraEsq) {
                    this.bloco(x - 1, 20, z + BLOCO_P - 4, 5, 112, 4, this.corSombra, M.LISO);
                    this.bloco(x - 1, 84, z + 3, 1, 30, BLOCO_P - 9, "#1d2547", M.LISO);
                }
                if (foraDir) {
                    this.bloco(x + BLOCO_L - 4, 20, z + BLOCO_P - 4, 5, 112, 4, this.corSombra, M.LISO);
                    this.bloco(x + BLOCO_L, 84, z + 3, 1, 30, BLOCO_P - 9, "#1d2547", M.LISO);
                }
            }
            return;
        }
        // depois das janelas: 1 = encosto do banco de trás, 2 = bagageiro, 3 = traseira
        var atras = l - this.janelaFim;
        var altura = (atras === 1) ? 64 : (atras === 2 ? 60 : 56);
        this.bloco(x, 20, z, BLOCO_L, altura, BLOCO_P, this.color, M.MADEIRA);
        this.bloco(x - (foraEsq ? 1 : 0), 20 + altura, z, BLOCO_L + (foraEsq ? 1 : 0) + (foraDir ? 1 : 0), 4, BLOCO_P,
            this.corSombra, M.LISO);
        if (atras === 1) {
            // as colunas de trás da janela, presas no encosto
            if (foraEsq) {
                this.bloco(x - 1, 20, z, 5, 80, 4, this.corSombra, M.LISO);
            }
            if (foraDir) {
                this.bloco(x + BLOCO_L - 4, 20, z, 5, 80, 4, this.corSombra, M.LISO);
            }
        } else if (atras === 2) {
            // bagagem coberta de couro, amarrada no bagageiro
            this.bloco(x + (foraEsq ? 3 : 0), 84, z + 2, BLOCO_L - (foraEsq ? 3 : 0) - (foraDir ? 3 : 0), 14, BLOCO_P - 2, "#4a3020", M.LISO);
            this.bloco(x + 10, 84, z + 2, 2, 16, BLOCO_P - 2, "#2a1c14", M.LISO);
        } else if (dentro) {
            // e um baú de madeira bem atrás
            this.bloco(x + 1, 80, z + 2, BLOCO_L - 2, 14, BLOCO_P - 7, "#7a5a3a", M.MADEIRA);
        }
    }

    // Janela (j): a cabine fica aberta entre o painel de baixo (60) e o
    // corrimão (96), bem na altura em que a bala voa, e sem teto, para as
    // câmeras de cima verem a bala passar por dentro. Lá dentro há dois
    // bancos, um de frente para o outro.
    janela(x, z, l, c) {
        var M = MATERIAL;
        var foraEsq = !this.ehCabine(l, c - 1);
        var foraDir = !this.ehCabine(l, c + 1);
        this.bloco(x + 2, 12, z, BLOCO_L - 4, 8, BLOCO_P, "#3b2a1a", M.MADEIRA);     // chassi
        this.bloco(x, 20, z, BLOCO_L, 4, BLOCO_P, "#5c3a22", M.MADEIRA);             // assoalho
        // o banco fica entre os painéis: encostado neles, as faces no mesmo
        // plano piscariam (as duas brigam pelo mesmo pixel)
        var zBanco = (l === this.janelaInicio) ? z : z + BLOCO_P - 10;
        var x1 = x + (foraEsq ? 4 : 0);
        var x2 = x + BLOCO_L - (foraDir ? 4 : 0);
        this.bloco(x1, 24, zBanco, x2 - x1, 18, 10, "#5c3a22", M.MADEIRA);
        this.bloco(x1, 42, zBanco, x2 - x1, 5, 10, "#9a3d33", M.LISO);
        // do lado de fora: painel, friso e corrimão (a bala passa entre os dois)
        if (foraEsq) {
            this.bloco(x, 24, z, 4, 32, BLOCO_P, this.color, M.MADEIRA);
            this.bloco(x - 1, 56, z, 5, 4, BLOCO_P, this.corSombra, M.LISO);
            this.bloco(x - 1, 96, z, 4, 4, BLOCO_P, this.corSombra, M.LISO);
        }
        if (foraDir) {
            this.bloco(x + BLOCO_L - 4, 24, z, 4, 32, BLOCO_P, this.color, M.MADEIRA);
            this.bloco(x + BLOCO_L - 4, 56, z, 5, 4, BLOCO_P, this.corSombra, M.LISO);
            this.bloco(x + BLOCO_L - 3, 96, z, 4, 4, BLOCO_P, this.corSombra, M.LISO);
        }
    }
}

class Muro extends Obstaculo {
    constructor() {
        // parede de seis blocos de largura que fecha o campo do fundo até a frente
        var matriz = [];
        for (var l = 0; l < LINHAS_CAMPO; l++) {
            matriz.push("MMMMMM");
        }
        super("MURO", matriz, 0, PALETAS.muro);
    }

    // Sobrescreve desenhaBloco(): tijolos com a capa por cima. O tiro abre
    // um buraco até o chão, aberto para o céu, e a parede que sobra em
    // volta fica com a beirada quebrada. As câmeras olham o muro de cima e
    // pelo comprido (as faces dos lados ficam de costas para elas), então é
    // por cima que o buraco tem de aparecer.
    desenhaBloco(x, z, l, c, tipo, intacto) {
        if (intacto) {
            this.parede(x, z, l, c);
        } else {
            this.entulho(x, z, l, c);
        }
    }

    // Bloco inteiro. Do lado de cada vizinho arrancado, a parte de cima
    // desce em degraus de tijolo, como uma parede quebrada. Cada casa usa
    // um dos jeitos de QUEBRAS_MURO, para a beirada não sair reta. A parte
    // de baixo (até 88 ou 99, acima da bala) fica sempre inteira, porque a
    // casa continua parando a bala.
    parede(x, z, l, c) {
        var M = MATERIAL;
        var fundo = this.arrancado(l - 1, c);
        var frente = this.arrancado(l + 1, c);
        var esquerda = this.arrancado(l, c - 1);
        var direita = this.arrancado(l, c + 1);
        if (!fundo && !frente && !esquerda && !direita) {
            this.bloco(x, 0, z, BLOCO_L, 150, BLOCO_P, this.color, M.TIJOLO);
            this.bloco(x, 150, z, BLOCO_L, 6, BLOCO_P, this.corSombra, M.LISO);
            return;
        }
        var quebra = QUEBRAS_MURO[(l * 7 + c * 5) % QUEBRAS_MURO.length];
        var y = quebra[0];
        this.bloco(x, 0, z, BLOCO_L, y, BLOCO_P, this.color, M.TIJOLO);
        var x1 = x;
        var x2 = x + BLOCO_L;
        var z1 = z;
        var z2 = z + BLOCO_P;
        for (var k = 0; k < 3; k++) {
            var recuo = quebra[4 + k];
            x1 = x + (esquerda ? recuo : 0);
            x2 = x + BLOCO_L - (direita ? recuo : 0);
            z1 = z + (fundo ? recuo : 0);
            z2 = z + BLOCO_P - (frente ? recuo : 0);
            // quebrada dos dois lados, a casa vira um pilar fino, mas não some
            if (x2 - x1 < 4) {
                x1 = (x1 + x2) / 2 - 2;
                x2 = x1 + 4;
            }
            if (z2 - z1 < 4) {
                z1 = (z1 + z2) / 2 - 2;
                z2 = z1 + 4;
            }
            var topo = (k < 2) ? quebra[1 + k] : 150;
            this.bloco(x1, y, z1, x2 - x1, topo - y, z2 - z1, this.color, M.TIJOLO);
            y = topo;
        }
        // a capa sobra só em cima do último degrau
        this.bloco(x1, 150, z1, x2 - x1, 6, z2 - z1, this.corSombra, M.LISO);
    }

    // O que sobra de um bloco arrancado: um montinho baixo de caliça e uns
    // tijolos soltos. Nas colunas de fora alguns caem no chão, do lado do
    // muro, e aparecem até na câmera baixa, que não enxerga dentro dele.
    entulho(x, z, l, c) {
        var M = MATERIAL;
        var semente = (l * 5 + c * 3) % 4;
        this.bloco(x + 1, 0, z + 2, BLOCO_L - 2, 5, BLOCO_P - 4, this.color, M.TIJOLO);
        this.bloco(x + 3 + semente, 5, z + 4, 11, 6, 9, this.corSombra, M.LISO, 0.3 + semente * 0.4);
        this.bloco(x + 9 - semente, 5, z + 13, 10, 5, 6, this.color, M.LISO, 1.1 - semente * 0.3);
        if (c === 0 || c === this.colunas - 1) {
            var fora = (c === 0) ? x - 14 : x + BLOCO_L + 2;
            this.bloco(fora + semente, 0, z + 3 + semente * 2, 11, 5, 6, this.color, M.LISO, 0.4 + semente * 0.5);
            this.bloco(fora + 4 - semente, 0, z + 14 - semente, 7, 4, 5, this.corSombra, M.LISO, 1.3 - semente * 0.4);
        }
    }
}

/* --------------------------- Particula --------------------------- */

// As partículas são criadas todas no começo e reaproveitadas (veja o
// jogo.js): criar e jogar fora objetos durante a partida faria o
// navegador parar de vez em quando para limpar a memória.
class Particula extends Obj {
    ativa = false;
    velX = 0;
    velY = 0;
    velZ = 0;
    vida = 0;
    vidaTotal = 1;
    tamanho = 5;
    gravidade = 0.15;

    constructor() {
        super(0, 0, 0, 5, 5, 5, "#ffffff");
    }

    // põe a partícula de novo em jogo, saindo do ponto (x, y, z)
    reativa(x, y, z, cor, forca) {
        this.tamanho = 5;
        this.gravidade = 0.15;
        this.material = MATERIAL.LISO;
        this.x = x - 2.5;
        this.y = y - 2.5;
        this.z = z - 2.5;
        this.color = cor;
        this.velX = (Math.random() - 0.5) * forca;
        this.velZ = (Math.random() - 0.5) * forca;
        this.velY = (Math.random() * 0.7 + 0.25) * forca;
        this.vidaTotal = 25 + Math.random() * 25;
        this.vida = this.vidaTotal;
        this.ativa = true;
        this.guardaPosicao();
    }

    move() {
        this.x += this.velX;
        this.y += this.velY;
        this.z += this.velZ;
        this.velY -= this.gravidade;
        // quica no chão e vai perdendo força
        if (this.y < 0) {
            this.y = 0;
            this.velY = -this.velY * 0.4;
            this.velX *= 0.6;
            this.velZ *= 0.6;
        }
        this.vida -= 1;
        if (this.vida <= 0) {
            this.ativa = false;
        }
    }

    // aproveita o desenha() da classe-mãe e só acerta o tamanho:
    // a partícula vai encolhendo até sumir
    desenha(alfa) {
        var s = this.tamanho * Math.max(this.vida / this.vidaTotal, 0.15);
        this.width = s;
        this.height = s;
        this.depth = s;
        super.desenha(alfa);
    }
}

/* ----------------------------- Texto ----------------------------- */

// Escreve no HUD com a fonte de pixels. Cada texto pronto fica guardado
// numa imagem: da próxima vez é só copiar, sem pintar letra por letra.
class Texto {
    static cache = new Map();
    static corSombra = "rgba(8, 6, 28, 0.85)";

    constructor(ctx) {
        this.ctx = ctx;
    }

    // tamanho = quantos pixels do canvas vale cada pixel da letra
    // alinhamento = "esquerda", "centro" ou "direita"
    // sombra = true pinta uma cópia escura um pixel da letra abaixo e à direita
    draw(texto, x, y, tamanho, cor, alinhamento, sombra) {
        texto = String(texto).toUpperCase();
        if (texto.length === 0) {
            return;
        }
        var chave = texto + "|" + tamanho + "|" + cor + (sombra ? "|s" : "");
        var imagem = Texto.cache.get(chave);
        if (!imagem) {
            if (Texto.cache.size > 300) {
                Texto.cache.clear();
            }
            imagem = this.renderiza(texto, tamanho, cor, sombra);
            Texto.cache.set(chave, imagem);
        }
        if (alinhamento === "centro") { x -= this.largura(texto, tamanho) / 2; }
        if (alinhamento === "direita") { x -= this.largura(texto, tamanho); }
        // a imagem começa duas linhas acima da letra, por causa dos acentos
        this.ctx.drawImage(imagem, Math.round(x), y - 2 * tamanho);
    }

    largura(texto, tamanho) {
        return String(texto).length * 6 * tamanho - tamanho;
    }

    renderiza(texto, tamanho, cor, sombra) {
        var extra = sombra ? tamanho : 0;
        var tela = document.createElement("canvas");
        tela.width = this.largura(texto, tamanho) + extra;
        tela.height = 11 * tamanho + extra;
        var ctx = tela.getContext("2d");
        if (sombra) {
            for (var i = 0; i < texto.length; i++) {
                this.desenhaLetra(ctx, texto[i], i * 6 * tamanho + tamanho, 3 * tamanho, tamanho, Texto.corSombra);
            }
        }
        for (var i = 0; i < texto.length; i++) {
            this.desenhaLetra(ctx, texto[i], i * 6 * tamanho, 2 * tamanho, tamanho, cor);
        }
        return tela;
    }

    desenhaLetra(ctx, letra, x, y, tamanho, cor) {
        var acento = ACENTOS[letra];
        if (acento) {
            letra = acento[0];
            var marca = MARCAS[acento[1]];
            // a cedilha vai embaixo da letra; os outros acentos, em cima
            var yMarca = (acento[1] === "cedilha") ? y + 7 * tamanho : y - 2 * tamanho;
            pintaMatriz(ctx, marca, x, yMarca, tamanho, tamanho, cor, false);
        }
        var matriz = FONTE[letra] || FONTE["?"];
        pintaMatriz(ctx, matriz, x, y, tamanho, tamanho, cor, false);
    }
}

/* ------------------------------ Menu ----------------------------- */

class Menu {
    selecionada = 0;

    // opcoes: lista de { nome: "CENÁRIO", valores: ["CACTO", ...], atual: 0 }
    // texto: o Texto que escreve no HUD (se faltar, cria um no pincel2d)
    constructor(opcoes, texto) {
        this.opcoes = opcoes;
        this.texto = texto || new Texto(pincel2d);
    }

    sobe() {
        this.selecionada -= 1;
        if (this.selecionada < 0) { this.selecionada = this.opcoes.length - 1; }
    }

    desce() {
        this.selecionada += 1;
        if (this.selecionada >= this.opcoes.length) { this.selecionada = 0; }
    }

    // direcao: 1 = próximo valor, -1 = valor anterior
    muda(direcao) {
        var opcao = this.opcoes[this.selecionada];
        opcao.atual += direcao;
        if (opcao.atual < 0) { opcao.atual = opcao.valores.length - 1; }
        if (opcao.atual >= opcao.valores.length) { opcao.atual = 0; }
    }

    // número do valor escolhido na opção "indice"
    valor(indice) {
        return this.opcoes[indice].atual;
    }

    // texto do valor escolhido na opção "indice"
    nomeDoValor(indice) {
        return this.opcoes[indice].valores[this.opcoes[indice].atual];
    }

    desenha(xNome, xValor, y, espaco) {
        for (var i = 0; i < this.opcoes.length; i++) {
            var opcao = this.opcoes[i];
            var escolhida = (i === this.selecionada);
            var cor = escolhida ? CORES.destaque : CORES.texto;
            var valor = opcao.valores[opcao.atual];
            if (escolhida) {
                valor = "< " + valor + " >";
            }
            this.texto.draw(opcao.nome, xNome, y + i * espaco, 3, cor, "esquerda", true);
            this.texto.draw(valor, xValor, y + i * espaco, 3, cor, "centro", true);
        }
    }
}

/* ------------------------------ Som ------------------------------ */

// Os sons são criados na hora pelo navegador (Web Audio), com ondas
// quadradas e chiado, parecidos com os do chip de som do Atari. Todos
// passam por um volume geral, e o chiado é sorteado uma vez só.
class Som {
    static contexto = null;
    static mestre = null;       // volume geral: todos os sons passam por ele
    static ruido = null;        // um segundo de chiado, reaproveitado em todo tiro
    static semSom = false;

    // Som.mudo continua sendo lido e trocado como antes (tecla M e botão
    // da página); desligar também cala na hora o que já estava tocando
    static get mudo() {
        return Som.semSom;
    }

    static set mudo(valor) {
        Som.semSom = Boolean(valor);
        if (Som.mestre) {
            Som.mestre.gain.setTargetAtTime(Som.semSom ? 0 : 1, Som.contexto.currentTime, 0.02);
        }
    }

    // notas: lista de [frequência, duração em segundos, frequência final]
    //   frequência 0        = silêncio
    //   frequência "ruido"  = chiado (tiros e passos)
    //   a frequência final é opcional e faz o som "escorregar"
    //   no chiado, a terceira e a quarta posições são o abafador (veja tocaRuido)
    // juntas: true toca todas as notas ao mesmo tempo, em camadas, em vez
    // de uma depois da outra (o estrondo e o baque do tiro, por exemplo)
    constructor(notas, volume = 0.12, onda = "square", juntas = false) {
        this.notas = notas;
        this.volume = volume;
        this.onda = onda;
        this.juntas = juntas;
    }

    static pegaContexto() {
        if (!Som.contexto) {
            var Classe = window.AudioContext || window.webkitAudioContext;
            if (!Classe) {
                return null;
            }
            try {
                Som.contexto = new Classe();
            } catch (erro) {
                return null;
            }
            Som.mestre = Som.contexto.createGain();
            Som.mestre.gain.value = Som.semSom ? 0 : 1;
            Som.mestre.connect(Som.contexto.destination);
        }
        // o navegador só libera o som depois de uma tecla ou clique
        if (Som.contexto.state === "suspended") {
            Som.contexto.resume();
        }
        return Som.contexto;
    }

    static pegaRuido(contexto) {
        if (!Som.ruido) {
            var amostras = contexto.sampleRate;
            Som.ruido = contexto.createBuffer(1, amostras, contexto.sampleRate);
            var dados = Som.ruido.getChannelData(0);
            for (var i = 0; i < amostras; i++) {
                dados[i] = Math.random() * 2 - 1;
            }
        }
        return Som.ruido;
    }

    // pan: de -1 (só na caixa da esquerda) a 1 (só na da direita); opcional
    play(pan) {
        if (Som.mudo) {
            return;
        }
        var contexto = Som.pegaContexto();
        if (!contexto) {
            return;
        }
        var destino = Som.mestre;
        if (pan && contexto.createStereoPanner) {
            var panner = contexto.createStereoPanner();
            panner.pan.value = Math.max(-1, Math.min(1, pan));
            panner.connect(Som.mestre);
            destino = panner;
        }
        var inicio = contexto.currentTime;
        for (var i = 0; i < this.notas.length; i++) {
            var frequencia = this.notas[i][0];
            var duracao = this.notas[i][1];
            if (frequencia === "ruido") {
                this.tocaRuido(contexto, destino, inicio, duracao, this.notas[i][2], this.notas[i][3]);
            } else if (frequencia > 0) {
                this.tocaNota(contexto, destino, frequencia, this.notas[i][2], inicio, duracao);
            }
            if (!this.juntas) {
                inicio += duracao;
            }
        }
    }

    tocaNota(contexto, destino, frequencia, frequenciaFinal, inicio, duracao) {
        var oscilador = contexto.createOscillator();
        var ganho = contexto.createGain();
        oscilador.type = this.onda;
        oscilador.frequency.setValueAtTime(frequencia, inicio);
        if (frequenciaFinal) {
            oscilador.frequency.exponentialRampToValueAtTime(frequenciaFinal, inicio + duracao);
        }
        ganho.gain.setValueAtTime(this.volume, inicio);
        ganho.gain.exponentialRampToValueAtTime(0.001, inicio + duracao);
        oscilador.connect(ganho);
        ganho.connect(destino);
        oscilador.start(inicio);
        oscilador.stop(inicio + duracao);
    }

    // O abafador (opcional) só deixa passar a parte grave do chiado, abaixo
    // da frequência dada: baixa, o tiro vira um estrondo; alta, um estalo
    // seco. Com a frequência final, ele vai fechando enquanto o som morre.
    tocaRuido(contexto, destino, inicio, duracao, abafador, abafadorFinal) {
        var buffer = Som.pegaRuido(contexto);
        var fonte = contexto.createBufferSource();
        var ganho = contexto.createGain();
        fonte.buffer = buffer;
        ganho.gain.setValueAtTime(this.volume * 2, inicio);
        ganho.gain.exponentialRampToValueAtTime(0.001, inicio + duracao);
        if (abafador) {
            var filtro = contexto.createBiquadFilter();
            filtro.type = "lowpass";
            filtro.frequency.setValueAtTime(abafador, inicio);
            if (abafadorFinal) {
                filtro.frequency.exponentialRampToValueAtTime(abafadorFinal, inicio + duracao);
            }
            fonte.connect(filtro);
            filtro.connect(ganho);
        } else {
            fonte.connect(ganho);
        }
        ganho.connect(destino);
        // cada tiro começa num pedaço diferente do chiado
        fonte.start(inicio, Math.random() * (buffer.duration - duracao), duracao);
    }
}

/* ----------------------------- Camera ---------------------------- */

// A câmera não é um objeto da cena (não aparece, não colide), por isso não
// herda de Obj. Ela tem três posições prontas e, a cada passo do jogo,
// desliza suavemente até a posição que a situação pede.
class Camera {
    // Na clássica e na alta cabem o campo inteiro e os dois pistoleiros em
    // qualquer canto da área deles (o chapéu de quem está no canto da frente
    // é o que mais escapa pelas laterais), com a cerca do fundo logo abaixo
    // da faixa do placar. A cinema fica baixa e corta o campo, mas recua o
    // bastante para os pistoleiros nunca saírem da tela.
    static PRESETS = [
        { chave: "classica", nome: "CLÁSSICA", olho: [450, 994, 886], alvo: [450, 0, 277], fov: 36 },
        { chave: "alta", nome: "ALTA", olho: [450, 1102, 566], alvo: [450, 0, 250], fov: 36 },
        { chave: "cinema", nome: "CINEMA", olho: [450, 400, 1228], alvo: [450, 150, 120], fov: 42 }
    ];

    // abertura do duelo: no meio da rua, na altura dos olhos dos pistoleiros
    // (mais baixo, o banco do outro lado da rua tapava as pernas do pistoleiro
    // da direita) e aberta o bastante para os dois caberem inteiros
    static INTRO = { olho: [450, 110, 800], alvo: [450, 90, 160], fov: 52 };

    indice = 0;
    tempo = 0;
    suavidade = 0.06;           // quanto anda por passo rumo à posição desejada

    constructor() {
        this.presets = Camera.PRESETS;
        // posição atual, a do passo anterior (para interpolar) e a desejada
        this.olho = [0, 0, 0];
        this.alvo = [0, 0, 0];
        this.fov = 40;
        this.olhoAnt = [0, 0, 0];
        this.alvoAnt = [0, 0, 0];
        this.fovAnt = 40;
        this.olhoMeta = [0, 0, 0];
        this.alvoMeta = [0, 0, 0];
        this.fovMeta = 40;
        this.orbita();
        this.pula();
    }

    get nome() {
        return this.presets[this.indice].nome;
    }

    get chave() {
        return this.presets[this.indice].chave;
    }

    // Próxima câmera; devolve o nome dela. A meta muda já aqui, e não só no
    // próximo passo, para um pula() logo depois ir direto para a câmera nova
    // (no menu, na abertura e no fim o passo seguinte põe a meta de cada um).
    troca() {
        this.indice = (this.indice + 1) % this.presets.length;
        this.metaDe(this.presets[this.indice]);
        return this.nome;
    }

    // escolhe pela chave ("classica", "alta", "cinema"); aceita também o nome
    escolhe(chave) {
        var procura = String(chave).toLowerCase();
        for (var i = 0; i < this.presets.length; i++) {
            if (this.presets[i].chave === procura || this.presets[i].nome.toLowerCase() === procura) {
                this.indice = i;
                this.metaDe(this.presets[i]);
                return true;
            }
        }
        return false;
    }

    // muda a meta sem nenhuma conta nova de memória
    metaDe(pose) {
        for (var i = 0; i < 3; i++) {
            this.olhoMeta[i] = pose.olho[i];
            this.alvoMeta[i] = pose.alvo[i];
        }
        this.fovMeta = pose.fov;
    }

    // no menu a câmera passeia devagar num arco em frente ao campo
    orbita() {
        var angulo = Math.sin(this.tempo * 0.0035) * 1.05;
        this.olhoMeta[0] = 450 + Math.sin(angulo) * 1000;
        this.olhoMeta[1] = 300;
        this.olhoMeta[2] = 216 + Math.cos(angulo) * 1000;
        this.alvoMeta[0] = 450;
        this.alvoMeta[1] = 80;
        this.alvoMeta[2] = 200;
        this.fovMeta = 40;
    }

    // vai direto para a meta, sem deslizar
    pula() {
        for (var i = 0; i < 3; i++) {
            this.olho[i] = this.olhoAnt[i] = this.olhoMeta[i];
            this.alvo[i] = this.alvoAnt[i] = this.alvoMeta[i];
        }
        this.fov = this.fovAnt = this.fovMeta;
    }

    // começo da partida: corta para perto do chão (a contagem faz o resto)
    comecaIntro() {
        this.metaDe(Camera.INTRO);
        this.pula();
    }

    // uma vez por passo do jogo
    // estado: statusJogo; contagem: passos que faltam para o "FOGO!";
    // vencedor: o pistoleiro que ganhou (ou null)
    atualiza(estado, contagem, vencedor) {
        for (var i = 0; i < 3; i++) {
            this.olhoAnt[i] = this.olho[i];
            this.alvoAnt[i] = this.alvo[i];
        }
        this.fovAnt = this.fov;
        this.tempo += 1;

        var preset = this.presets[this.indice];
        var suave = this.suavidade;
        if (estado === "start") {
            this.orbita();
        } else if ((estado === "jogando" || estado === "pausado") && contagem > 0) {
            // durante o "PREPARAR..." sai da abertura e chega na câmera escolhida
            // (numa pausa no meio da contagem ela fica parada onde estava)
            var t = 1 - contagem / 90;
            var e = t * t * (3 - 2 * t);
            var intro = Camera.INTRO;
            for (var i = 0; i < 3; i++) {
                this.olhoMeta[i] = intro.olho[i] + (preset.olho[i] - intro.olho[i]) * e;
                this.alvoMeta[i] = intro.alvo[i] + (preset.alvo[i] - intro.alvo[i]) * e;
            }
            this.fovMeta = intro.fov + (preset.fov - intro.fov) * e;
            suave = 0.25;
        } else if (estado === "fim" && vencedor) {
            // vitória: chega perto do vencedor, de frente, deixando ele na
            // metade de baixo da tela (em cima ficam as letras)
            var cx = vencedor.x + vencedor.width / 2;
            var cz = vencedor.z + vencedor.depth / 2;
            this.olhoMeta[0] = cx + (450 - cx) * 0.3;
            this.olhoMeta[1] = 230;
            this.olhoMeta[2] = cz + 530;
            this.alvoMeta[0] = cx;
            this.alvoMeta[1] = 160;
            this.alvoMeta[2] = cz;
            this.fovMeta = 38;
            suave = 0.05;
        } else {
            this.metaDe(preset);
        }

        for (var i = 0; i < 3; i++) {
            this.olho[i] += (this.olhoMeta[i] - this.olho[i]) * suave;
            this.alvo[i] += (this.alvoMeta[i] - this.alvo[i]) * suave;
        }
        this.fov += (this.fovMeta - this.fov) * suave;
    }

    // uma vez por quadro desenhado; tremor = força da tremida de tela,
    // alfa = quanto do próximo passo já passou (interpolação)
    aplica(tremor, alfa) {
        var a = (alfa === undefined) ? 1 : alfa;
        var ox = this.olhoAnt[0] + (this.olho[0] - this.olhoAnt[0]) * a;
        var oy = this.olhoAnt[1] + (this.olho[1] - this.olhoAnt[1]) * a;
        var oz = this.olhoAnt[2] + (this.olho[2] - this.olhoAnt[2]) * a;
        var ax = this.alvoAnt[0] + (this.alvo[0] - this.alvoAnt[0]) * a;
        var ay = this.alvoAnt[1] + (this.alvo[1] - this.alvoAnt[1]) * a;
        var az = this.alvoAnt[2] + (this.alvo[2] - this.alvoAnt[2]) * a;
        if (tremor > 0) {
            // a tela treme: olho e alvo andam juntos um pouquinho para os lados
            var dx = (Math.random() - 0.5) * tremor * 1.2;
            var dy = (Math.random() - 0.5) * tremor * 1.2;
            ox += dx;
            oy += dy;
            ax += dx;
            ay += dy;
        }
        pincel.defineCamera(ox, oy, oz, ax, ay, az, this.fovAnt + (this.fov - this.fovAnt) * a);
    }
}
