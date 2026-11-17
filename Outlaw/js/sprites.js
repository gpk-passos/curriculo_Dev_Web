/* =====================================================================
   OUTLAW 3D - desenhos do jogo
   No Atari 2600 não existiam arquivos de imagem: cada personagem era uma
   pequena grade de pixels guardada dentro do cartucho. Aqui fazemos igual:
   cada desenho é uma matriz de textos. O ponto "." é um pixel vazio.
   Na versão 3D o mundo é feito de cubinhos (voxels): os pistoleiros são
   bonecos de cubinhos montados peça por peça, o alvo é a matriz dele em
   pé, e os obstáculos viram grades de blocos vistas de cima, no chão da rua.
   ===================================================================== */

// tamanho de cada "pixel" dos personagens: bem grande, como no Atari, onde
// um pistoleiro em pé ocupava um terço da altura do campo. No 3D é também
// o lado de cada cubinho.
var PIXEL_L = 7;
var PIXEL_A = 7;

// cores usadas no jogo
var CORES = {
    faixa: "#1b1433",       // faixa do placar
    jogador1: "#f28c28",    // pistoleiro laranja
    jogador1Escuro: "#8a4a12",
    jogador2: "#e53935",    // pistoleiro vermelho
    jogador2Escuro: "#7f1d1d",
    pele: "#f2c9a0",
    arma: "#d7d7e0",
    couro: "#4a2e1c",       // cinto e coldre dos bonecos 3D
    cabelo: "#2a1a12",      // cabelo e olhos dos bonecos 3D
    destaque: "#ffd54f",
    texto: "#ffffff",
    textoFraco: "#d5d0f5"
};

// No cartucho de 1978 as cores do campo mudavam conforme o jogo escolhido.
// Aqui cada cenário tem a sua paleta, inspirada nas do original:
// campo = chão do duelo, bloco = obstáculo e moldura, sombra = detalhe escuro.
// As outras cores são do mundo 3D em volta: chao = terra fora do campo,
// ceuTopo e ceuHorizonte = degradê do céu, luz = cor do sol, ambiente =
// luz que vem do céu, chaoLuz = luz rebatida pelo chão, nevoa = cor da
// poeira no horizonte e direcaoLuz = para onde a luz do sol anda.
var PALETAS = {
    // azul e lilás, num fim de tarde alaranjado
    cacto: {
        campo: "#2d32b8", bloco: "#a459d0", sombra: "#7c3fa6",
        chao: "#262a96", ceuTopo: "#14185e", ceuHorizonte: "#f0905a",
        luz: "#fff0d8", ambiente: "#6a70d0", chaoLuz: "#3a2f6b", nevoa: "#c77a6a",
        direcaoLuz: [-0.45, -1, -0.55]
    },
    // roxo e azul, num crepúsculo cor-de-rosa
    diligencia: {
        campo: "#5d2b8f", bloco: "#6c8cf5", sombra: "#4560c4",
        chao: "#4a2275", ceuTopo: "#1a0d36", ceuHorizonte: "#d0609e",
        luz: "#ffe2f2", ambiente: "#7a5ab8", chaoLuz: "#3a1f55", nevoa: "#9e4f8a",
        direcaoLuz: [0.4, -1, -0.6]
    },
    // oliva e tijolo, numa tarde dourada
    muro: {
        campo: "#6b6b1e", bloco: "#c9523f", sombra: "#7a281f",
        chao: "#5a5a18", ceuTopo: "#352610", ceuHorizonte: "#f5b860",
        luz: "#fff2cc", ambiente: "#8f7a45", chaoLuz: "#4a4016", nevoa: "#c9965a",
        direcaoLuz: [-0.5, -1, -0.4]
    }
};

/* ---------------------------------------------------------------------
   PISTOLEIRO - 12 colunas x 18 linhas, sempre olhando para a direita.
   O jogador 2 usa os mesmos desenhos, só que espelhados.
     C = cor do jogador (chapéu e camisa)   E = cor escura (calça e botas)
     P = pele                               A = arma
   São os desenhos de lado, no estilo de 1978. No jogo 3D o pistoleiro é
   o boneco de cubinhos mais abaixo; estes desenhos ficam para os
   retratos da página quando o navegador não tem WebGL.
   --------------------------------------------------------------------- */

// parte de cima do corpo (11 linhas)
var CORPO_PARADO = [
    "...CCCC.....",
    "...EEEE.....",
    ".CCCCCCCC...",
    "...PPEP.....",
    "...PPPP.....",
    "....EE......",
    "..CCCCCC....",
    ".CCCCCCCC...",
    ".CCCCCCCC...",
    ".C.CCCC.C...",
    ".P.CCCC.P..."
];

var CORPO_MIRA_RETA = [
    "...CCCC.....",
    "...EEEE.....",
    ".CCCCCCCC...",
    "...PPEP.....",
    "...PPPP.....",
    "....EE......",
    "..CCCCCC....",
    ".CCCCCCCCPAA",
    ".C.CCCC.....",
    ".C.CCCC.....",
    ".P.CCCC....."
];

var CORPO_VITORIA = [
    "...CCCC.....",
    "...EEEE.....",
    ".CCCCCCCC...",
    ".P.PPEP.P...",
    ".C.PPPP.C...",
    ".C..EE..C...",
    ".CCCCCCCC...",
    "..CCCCCC....",
    "...CCCC.....",
    "...CCCC.....",
    "...CCCC....."
];

// pernas (7 linhas)
var PERNAS_PARADO = [
    "...EEEE.....",
    "...EEEE.....",
    "..EE..EE....",
    "..EE..EE....",
    "..EE..EE....",
    "..EE..EE....",
    "..EEE.EEE..."
];

var PERNAS_PASSO1 = [
    "...EEEE.....",
    "...EEEE.....",
    "..EE..EE....",
    ".EE....EE...",
    ".EE....EE...",
    ".EE....EE...",
    ".EEE...EEE.."
];

var PERNAS_PASSO2 = [
    "...EEEE.....",
    "...EEEE.....",
    "...EEEE.....",
    "....EE......",
    "....EE......",
    "....EE......",
    "....EEE....."
];

// pistoleiro atingido: cai sentado no chão, como no jogo original
var PISTOLEIRO_ATINGIDO = [
    "............",
    "............",
    "............",
    "............",
    "............",
    "............",
    "............",
    "..CCCC......",
    "..EEEE......",
    "CCCCCCCC....",
    "..PPEP......",
    "..PPPP......",
    "...EE.......",
    ".CCCCCC.....",
    "CCCCCCCC....",
    "C.CCCC.C..E.",
    "P.CCCCEEEEE.",
    "..EEEEEEEEE."
];

// cada quadro completo = parte de cima + pernas
// No Atari o braço subia ou descia para mirar na diagonal. No 3D a bala voa
// sempre na altura do peito e o corpo inteiro gira para a diagonal, então
// as três miras usam o mesmo braço estendido (miraReta), que aponta para
// onde a bala vai.
var SPRITES_PISTOLEIRO = {
    parado: CORPO_PARADO.concat(PERNAS_PARADO),
    passo1: CORPO_PARADO.concat(PERNAS_PASSO1),
    passo2: CORPO_PARADO.concat(PERNAS_PASSO2),
    miraReta: CORPO_MIRA_RETA.concat(PERNAS_PARADO),
    vitoria: CORPO_VITORIA.concat(PERNAS_PARADO),
    atingido: PISTOLEIRO_ATINGIDO
};

/* ---------------------------------------------------------------------
   PISTOLEIRO EM 3D - o boneco de cubinhos do jogo
   Esticar o desenho de lado para dentro da tela deixava o boneco chato,
   como um recorte de papel grosso. No 3D os dois ficam de frente um para
   o outro, então o boneco foi montado de verdade, peça por peça. Cada
   peça é uma caixa de cubinhos de uma cor só:
       [letra, x1, x2, y1, y2, z1, z2]     (de x1 até x2, contando os dois)
   contada em cubinhos a partir do meio do corpo, no chão:
       x = para a frente (para onde ele olha)   y = para cima
       z = para o lado da mão direita
   O cubinho (0, 0, 0) fica bem no meio da caixa de colisão, no chão. O
   boneco é montado olhando para a direita (o jogador 1); o jogador 2 é o
   mesmo boneco girado meia volta. Quando duas peças pegam o mesmo
   cubinho, vale a que vem depois (o olho pinta por cima do rosto).
     C = cor do jogador (chapéu e camisa)   E = cor escura (calça, botas e fita do chapéu)
     P = pele      A = arma      L = couro (cinto e coldre)
     F = fivela e lenço (amarelo)           O = olhos e cabelo
   São 18 cubinhos de altura, como o desenho de lado. A cabeça e o chapéu
   são grandes de propósito (7 dos 18): nas câmeras do jogo o boneco fica
   pequeno, e o que se vê de longe é o chapéu na cor do jogador. Na altura
   da bala (o cubinho y = 10, de 70 a 77) ele tem 7 cubinhos de um braço
   ao outro: é a PROF_PISTOLEIRO de avulso.js.
   --------------------------------------------------------------------- */

// cabeça: o rosto fica virado para a frente (x = 1) e o nariz sai dele
var CABECA_3D = [
    ["P", -2, 1, 11, 14, -2, 2],    // cabeça
    ["O", -2, -2, 11, 14, -2, 2],   // cabelo na nuca
    ["O", 1, 1, 13, 13, -1, -1],    // olhos
    ["O", 1, 1, 13, 13, 1, 1],
    ["P", 2, 2, 12, 12, 0, 0]       // nariz
];

// Chapéu de vaqueiro: a aba é oval, mais comprida para a frente e para
// trás, como no desenho de lado. As câmeras veem o boneco quase sempre de
// lado, então é assim que a aba aparece larga; de frente ela ainda passa
// da cabeça; e, de cima, o chapéu comprido aponta para o rival e deixa os
// ombros e os braços aparecerem dos dois lados (a parte mais larga da aba
// fica atrás dos ombros).
var CHAPEU_3D = [
    ["C", -4, 3, 15, 15, -1, 1],    // aba oval, em três peças
    ["C", -3, 2, 15, 15, -2, 2],
    ["C", -2, -1, 15, 15, -3, 3],
    ["E", -2, 1, 16, 16, -1, 1],    // fita em volta da copa
    ["C", -2, 1, 17, 17, 0, 0],     // alto da copa, arredondado
    ["C", -1, 0, 17, 17, -1, 1]
];

// tronco: alto da calça, cinto com fivela e camisa com o lenço no pescoço
var TRONCO_3D = [
    ["E", -1, 1, 6, 6, -2, 2],      // alto da calça
    ["L", -1, 1, 7, 7, -2, 2],      // cinto
    ["F", 1, 1, 7, 7, 0, 0],        // fivela
    ["C", -1, 1, 8, 10, -2, 2],     // camisa
    ["F", 1, 1, 10, 10, -1, 1]      // lenço amarelo embaixo do queixo
];

// pernas com a bota de bico para a frente; no passo a pose empurra a
// perna inteira para a frente ou para trás
var PERNA_DIREITA_3D = [
    ["E", -1, 0, 1, 5, 1, 2],
    ["E", -1, 1, 0, 0, 1, 2]
];
var PERNA_ESQUERDA_3D = [
    ["E", -1, 0, 1, 5, -2, -1],
    ["E", -1, 1, 0, 0, -2, -1]
];

// braços um pouco abertos, com a mão perto do cinto: a pose de quem está
// pronto para sacar. De cima, os cotovelos e as mãos aparecem dos dois
// lados da aba do chapéu e mostram que ali tem uma pessoa.
var BRACO_DIREITO_3D = [
    ["C", 0, 0, 9, 10, 3, 3],       // manga, do ombro
    ["C", 0, 0, 8, 9, 4, 4],        // até o cotovelo, aberto para fora
    ["P", 0, 0, 7, 7, 4, 4]         // mão
];
var BRACO_ESQUERDO_3D = [
    ["C", 0, 0, 9, 10, -3, -3],
    ["C", 0, 0, 8, 9, -4, -4],
    ["P", 0, 0, 7, 7, -4, -4]
];

// Os dois pistoleiros são canhotos: o coldre fica na coxa esquerda, com o
// cabo do revólver ao lado da mão, pronto para sacar. (O porquê está no
// Pistoleiro, em avulso.js: é por causa de onde a bala sai.)
var COLDRE_3D = [
    ["L", -1, -1, 4, 6, -3, -3],    // coldre
    ["A", -1, -1, 7, 7, -3, -3]     // cabo do revólver
];
var COLDRE_VAZIO_3D = [
    ["L", -1, -1, 4, 6, -3, -3]
];

// Mira: o braço da arma esticado na altura do peito, com o cano
// exatamente na altura em que a bala voa. Como quem mira com um olho só,
// o braço sai do ombro e vem para o meio do corpo, em degraus, até o
// revólver ficar bem embaixo do olho esquerdo (z = -1).
var BRACO_MIRA_3D = [
    ["C", 0, 2, 10, 10, -3, -3],    // braço, do ombro para a frente
    ["C", 2, 3, 10, 10, -2, -2],    // vindo para o meio do corpo
    ["C", 3, 3, 10, 10, -1, -1],
    ["P", 4, 4, 10, 10, -1, -1],    // mão
    ["A", 4, 4, 9, 9, -1, -1],      // cabo, embaixo da mão
    ["A", 5, 5, 11, 11, -1, -1],    // tambor
    ["A", 5, 6, 10, 10, -1, -1]     // cano
];

// vitória: os dois braços para cima e o revólver apontado para o céu
var BRACOS_VITORIA_3D = [
    ["C", 0, 0, 10, 10, 3, 4],      // ombro direito
    ["C", 0, 0, 11, 13, 4, 4],      // braço direito levantado
    ["P", 0, 0, 14, 14, 4, 4],
    ["C", 0, 0, 10, 10, -4, -3],    // e o esquerdo, com a arma
    ["C", 0, 0, 11, 13, -4, -4],
    ["P", 0, 0, 14, 14, -4, -4],
    ["A", 0, 0, 15, 16, -4, -4],
    ["A", 1, 1, 15, 15, -4, -4]
];

// atingido: sentado no chão, como no jogo original, com as pernas
// esticadas para a frente e as botas de bico para cima. O tronco, os
// braços, a cabeça e o chapéu são as peças de sempre, só que mais baixas
// (veja a pose), e o chapéu fica caído para trás.
var SENTADO_3D = [
    ["E", -2, 0, 0, 0, -2, 2],      // assento
    ["E", 1, 4, 0, 1, 1, 2],        // pernas esticadas
    ["E", 1, 4, 0, 1, -2, -1],
    ["E", 5, 5, 0, 2, 1, 2],        // botas para cima
    ["E", 5, 5, 0, 2, -2, -1]
];

// Cada pose junta peças: [peças, cubinhos para a frente, cubinhos para cima].
// Os nomes são os do Pistoleiro.quadro() e de SPRITES_PISTOLEIRO.
var POSES_PISTOLEIRO = {
    parado: [
        [PERNA_DIREITA_3D, 0, 0], [PERNA_ESQUERDA_3D, 0, 0], [TRONCO_3D, 0, 0], [COLDRE_3D, 0, 0],
        [BRACO_DIREITO_3D, 0, 0], [BRACO_ESQUERDO_3D, 0, 0], [CABECA_3D, 0, 0], [CHAPEU_3D, 0, 0]
    ],
    // no passo, cada braço vai para o lado contrário da perna do mesmo lado
    passo1: [
        [PERNA_DIREITA_3D, 1, 0], [PERNA_ESQUERDA_3D, -1, 0], [TRONCO_3D, 0, 0], [COLDRE_3D, 0, 0],
        [BRACO_DIREITO_3D, -1, 0], [BRACO_ESQUERDO_3D, 1, 0], [CABECA_3D, 0, 0], [CHAPEU_3D, 0, 0]
    ],
    passo2: [
        [PERNA_DIREITA_3D, -1, 0], [PERNA_ESQUERDA_3D, 1, 0], [TRONCO_3D, 0, 0], [COLDRE_3D, 0, 0],
        [BRACO_DIREITO_3D, 1, 0], [BRACO_ESQUERDO_3D, -1, 0], [CABECA_3D, 0, 0], [CHAPEU_3D, 0, 0]
    ],
    // na mira o pé do lado da arma vai na frente
    miraReta: [
        [PERNA_DIREITA_3D, -1, 0], [PERNA_ESQUERDA_3D, 1, 0], [TRONCO_3D, 0, 0], [COLDRE_VAZIO_3D, 0, 0],
        [BRACO_DIREITO_3D, 0, 0], [BRACO_MIRA_3D, 0, 0], [CABECA_3D, 0, 0], [CHAPEU_3D, 0, 0]
    ],
    vitoria: [
        [PERNA_DIREITA_3D, 0, 0], [PERNA_ESQUERDA_3D, 0, 0], [TRONCO_3D, 0, 0], [COLDRE_VAZIO_3D, 0, 0],
        [BRACOS_VITORIA_3D, 0, 0], [CABECA_3D, 0, 0], [CHAPEU_3D, 0, 0]
    ],
    atingido: [
        [SENTADO_3D, 0, 0], [TRONCO_3D, -1, -5], [BRACO_DIREITO_3D, -1, -5], [BRACO_ESQUERDO_3D, -1, -5],
        [CABECA_3D, -1, -5], [CHAPEU_3D, -2, -5]
    ]
};

/* ---------------------------------------------------------------------
   OBSTÁCULOS - grades de blocos, como os gráficos de cenário ("playfield")
   do Atari. No cartucho o obstáculo ficava guardado como uma grade de 18
   linhas; aqui é igual, só que a grade está deitada no chão da rua e cada
   linha é uma faixa de profundidade (do fundo para a frente).
   Cada letra é um tipo de bloco:
     MAIÚSCULA = para a bala   minúscula = só enfeite (a bala passa)
     "."       = vazio
   --------------------------------------------------------------------- */

var LINHAS_CAMPO = 18;      // linhas de blocos que cabem na profundidade do campo
var BLOCO_L = 22;           // largura de um bloco (eixo X)
var BLOCO_P = 24;           // profundidade de um bloco (18 x 24 = fundo até a frente)

// CACTO: o velho saguaro (T, tronco de 2 x 2 blocos com dois braços no alto)
// e palmas (P) na frente e atrás
var MATRIZ_CACTO = [        // 6 colunas x 8 linhas, começa na linha 5
    "...P..",
    "..PP..",
    "..P...",
    "..TT..",
    "..TT..",
    "...P..",
    "..PP..",
    "..P..."
];

// DILIGÊNCIA vista de cima, andando para o fundo: dois cavalos na frente
// (cada par HH é um cavalo), varal (b), rodas (R), cabine (C) e janelas (j)
// por onde a bala atravessa
var MATRIZ_DILIGENCIA = [   // 6 colunas x 12 linhas, começa na linha 3
    "HH..HH",
    "HH..HH",
    "HH..HH",
    "HH..HH",
    "..bb..",
    "RCCCCR",
    ".CCCC.",
    ".jjjj.",
    ".jjjj.",
    ".CCCC.",
    "RCCCCR",
    ".CCCC."
];

// MURO: 6 x 18 tijolos (M), montado por código, fecha a rua de ponta a ponta
// (veja a classe Muro)

/* ---------------------------------------------------------------------
   ALVO do modo de um jogador - 8 colunas x 12 linhas
     V = vermelho   B = branco
   No 3D ele vira uma tábua grossa pendurada, virada na diagonal para o
   atirador e para a câmera: as colunas vão para a largura da tábua.
   --------------------------------------------------------------------- */

var MATRIZ_ALVO = [
    "..VVVV..",
    ".VVVVVV.",
    "VVBBBBVV",
    "VVBBBBVV",
    "VBBVVBBV",
    "VBBVVBBV",
    "VBBVVBBV",
    "VBBVVBBV",
    "VVBBBBVV",
    "VVBBBBVV",
    ".VVVVVV.",
    "..VVVV.."
];

/* ---------------------------------------------------------------------
   FONTE - letras de 5 x 7 pixels para escrever no placar (e nas placas
   das lojas da cidade)
   --------------------------------------------------------------------- */

var FONTE = {
    "A": [".XXX.", "X...X", "X...X", "XXXXX", "X...X", "X...X", "X...X"],
    "B": ["XXXX.", "X...X", "X...X", "XXXX.", "X...X", "X...X", "XXXX."],
    "C": [".XXX.", "X...X", "X....", "X....", "X....", "X...X", ".XXX."],
    "D": ["XXXX.", "X...X", "X...X", "X...X", "X...X", "X...X", "XXXX."],
    "E": ["XXXXX", "X....", "X....", "XXXX.", "X....", "X....", "XXXXX"],
    "F": ["XXXXX", "X....", "X....", "XXXX.", "X....", "X....", "X...."],
    "G": [".XXX.", "X...X", "X....", "X.XXX", "X...X", "X...X", ".XXX."],
    "H": ["X...X", "X...X", "X...X", "XXXXX", "X...X", "X...X", "X...X"],
    "I": ["XXXXX", "..X..", "..X..", "..X..", "..X..", "..X..", "XXXXX"],
    "J": ["..XXX", "...X.", "...X.", "...X.", "...X.", "X..X.", ".XX.."],
    "K": ["X...X", "X..X.", "X.X..", "XX...", "X.X..", "X..X.", "X...X"],
    "L": ["X....", "X....", "X....", "X....", "X....", "X....", "XXXXX"],
    "M": ["X...X", "XX.XX", "X.X.X", "X.X.X", "X...X", "X...X", "X...X"],
    "N": ["X...X", "XX..X", "X.X.X", "X..XX", "X...X", "X...X", "X...X"],
    "O": [".XXX.", "X...X", "X...X", "X...X", "X...X", "X...X", ".XXX."],
    "P": ["XXXX.", "X...X", "X...X", "XXXX.", "X....", "X....", "X...."],
    "Q": [".XXX.", "X...X", "X...X", "X...X", "X.X.X", "X..X.", ".XX.X"],
    "R": ["XXXX.", "X...X", "X...X", "XXXX.", "X.X..", "X..X.", "X...X"],
    "S": [".XXXX", "X....", "X....", ".XXX.", "....X", "....X", "XXXX."],
    "T": ["XXXXX", "..X..", "..X..", "..X..", "..X..", "..X..", "..X.."],
    "U": ["X...X", "X...X", "X...X", "X...X", "X...X", "X...X", ".XXX."],
    "V": ["X...X", "X...X", "X...X", "X...X", "X...X", ".X.X.", "..X.."],
    "W": ["X...X", "X...X", "X...X", "X.X.X", "X.X.X", "XX.XX", "X...X"],
    "X": ["X...X", "X...X", ".X.X.", "..X..", ".X.X.", "X...X", "X...X"],
    "Y": ["X...X", "X...X", ".X.X.", "..X..", "..X..", "..X..", "..X.."],
    "Z": ["XXXXX", "....X", "...X.", "..X..", ".X...", "X....", "XXXXX"],
    "0": [".XXX.", "X...X", "X..XX", "X.X.X", "XX..X", "X...X", ".XXX."],
    "1": ["..X..", ".XX..", "..X..", "..X..", "..X..", "..X..", ".XXX."],
    "2": [".XXX.", "X...X", "....X", "...X.", "..X..", ".X...", "XXXXX"],
    "3": ["XXXXX", "...X.", "..X..", "...X.", "....X", "X...X", ".XXX."],
    "4": ["...X.", "..XX.", ".X.X.", "X..X.", "XXXXX", "...X.", "...X."],
    "5": ["XXXXX", "X....", "XXXX.", "....X", "....X", "X...X", ".XXX."],
    "6": ["..XX.", ".X...", "X....", "XXXX.", "X...X", "X...X", ".XXX."],
    "7": ["XXXXX", "....X", "...X.", "..X..", ".X...", ".X...", ".X..."],
    "8": [".XXX.", "X...X", "X...X", ".XXX.", "X...X", "X...X", ".XXX."],
    "9": [".XXX.", "X...X", "X...X", ".XXXX", "....X", "...X.", ".XX.."],
    " ": [".....", ".....", ".....", ".....", ".....", ".....", "....."],
    ".": [".....", ".....", ".....", ".....", ".....", ".XX..", ".XX.."],
    ",": [".....", ".....", ".....", ".....", ".XX..", "..X..", ".X..."],
    ":": [".....", ".XX..", ".XX..", ".....", ".XX..", ".XX..", "....."],
    "!": ["..X..", "..X..", "..X..", "..X..", "..X..", ".....", "..X.."],
    "?": [".XXX.", "X...X", "....X", "...X.", "..X..", ".....", "..X.."],
    "-": [".....", ".....", ".....", "XXXXX", ".....", ".....", "....."],
    "+": [".....", "..X..", "..X..", "XXXXX", "..X..", "..X..", "....."],
    "/": ["....X", "....X", "...X.", "..X..", ".X...", "X....", "X...."],
    "<": ["...X.", "..X..", ".X...", "X....", ".X...", "..X..", "...X."],
    ">": [".X...", "..X..", "...X.", "....X", "...X.", "..X..", ".X..."]
};

// letras acentuadas: letra base + nome do acento
var ACENTOS = {
    "Á": ["A", "agudo"], "É": ["E", "agudo"], "Í": ["I", "agudo"], "Ó": ["O", "agudo"], "Ú": ["U", "agudo"],
    "À": ["A", "grave"],
    "Â": ["A", "circunflexo"], "Ê": ["E", "circunflexo"], "Ô": ["O", "circunflexo"],
    "Ã": ["A", "til"], "Õ": ["O", "til"],
    "Ç": ["C", "cedilha"]
};

// os acentos ocupam duas linhas acima da letra (a cedilha fica embaixo)
var MARCAS = {
    agudo: ["...X.", "..X.."],
    grave: [".X...", "..X.."],
    circunflexo: ["..X..", ".X.X."],
    til: [".XX.X", "X.XX."],
    cedilha: ["..X..", ".XX.."]
};
