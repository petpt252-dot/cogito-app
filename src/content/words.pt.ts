// Banco de palavras em português europeu (PT-PT). Listas alinhadas por posição com words.en.ts.
// Vocabulário de Portugal (comboio, autocarro, berbequim, roupeiro, chávena, frigorífico…).
import { morePt } from './words.more';

export const categories: Record<string, string[]> = {
  fruit: ['maçã', 'banana', 'cereja', 'uva', 'limão', 'manga', 'pêssego', 'pera', 'ameixa', 'melão', 'laranja', 'morango'],
  animal: ['cavalo', 'tigre', 'coelho', 'ovelha', 'lobo', 'urso', 'camelo', 'zebra', 'cabra', 'macaco', 'leão', 'raposa'],
  tool: ['martelo', 'serrote', 'berbequim', 'pá', 'alicate', 'formão', 'machado', 'ancinho', 'escadote', 'enxada', 'prego', 'parafuso'],
  furniture: ['cadeira', 'mesa', 'sofá', 'cama', 'roupeiro', 'prateleira', 'secretária', 'berço', 'candeeiro', 'cómoda', 'armário', 'poltrona'],
  clothing: ['camisa', 'casaco', 'cachecol', 'luva', 'meia', 'chapéu', 'saia', 'sobretudo', 'bota', 'cinto', 'gravata', 'camisola'],
  vehicle: ['comboio', 'autocarro', 'camião', 'barco', 'avião', 'trator', 'elétrico', 'mota', 'carrinha', 'navio', 'helicóptero', 'táxi'],
  instrument: ['piano', 'violino', 'guitarra', 'tambor', 'flauta', 'trompete', 'harpa', 'violoncelo', 'acordeão', 'clarinete', 'saxofone', 'órgão'],
  kitchen: ['colher', 'garfo', 'faca', 'prato', 'chávena', 'chaleira', 'taça', 'frigideira', 'tacho', 'jarro', 'forno', 'ralador'],
  bird: ['águia', 'coruja', 'papagaio', 'cisne', 'pombo', 'corvo', 'pato', 'pardal', 'cegonha', 'gaivota', 'pinguim', 'pavão'],
  vegetable: ['cenoura', 'cebola', 'batata', 'couve', 'alface', 'pimento', 'alho', 'abóbora', 'espinafre', 'pepino', 'tomate', 'nabo'],
};

export const misc: string[] = [
  'âncora', 'balão', 'barril', 'cesto', 'sino', 'cobertor', 'garrafa', 'pulseira', 'ponte', 'escova',
  'balde', 'botão', 'cabana', 'gaiola', 'vela', 'canhão', 'tapete', 'castelo', 'gruta', 'corrente',
  'chaminé', 'igreja', 'falésia', 'relógio', 'nuvem', 'moeda', 'bússola', 'rolha', 'coroa', 'cortina',
  'deserto', 'diamante', 'porta', 'dragão', 'envelope', 'vedação', 'pena', 'bandeira', 'floresta', 'fonte',
  'jardim', 'glaciar', 'capacete', 'ilha', 'joia', 'chave', 'lago', 'lanterna', 'folha', 'carta',
  'biblioteca', 'farol', 'íman', 'mapa', 'mercado', 'máscara', 'prado', 'medalha', 'espelho', 'lua',
  'montanha', 'museu', 'colar', 'agulha', 'ninho', 'jornal', 'oceano', 'palácio', 'embrulho', 'pérola',
  'lápis', 'almofada', 'cachimbo', 'planeta', 'bolso', 'prisão', 'pirâmide', 'arco-íris', 'fita', 'anel',
  'rio', 'robô', 'foguetão', 'corda', 'sela', 'escola', 'concha', 'escudo', 'esqueleto', 'trenó',
  'neve', 'sabão', 'estátua', 'pedra', 'tempestade', 'mala', 'espada', 'telescópio', 'tenda', 'linha',
  'trono', 'bilhete', 'torre', 'toalha', 'tesouro', 'túnel', 'guarda-chuva', 'vale', 'jarra', 'vulcão',
  'carroça', 'muro', 'carteira', 'roda', 'apito', 'janela', 'arame', 'osso', 'tijolo', 'duna',
  'motor', 'quinta', 'fogo', 'globo', 'porto', 'hospital', 'icebergue', 'frasco', 'cozinha', 'fechadura',
  // + 914 nomes adicionais (words.more.ts), aligned by position
  ...morePt,
];

export const assessment: string[] = [
  // forma 1
  'mármore', 'fósforo', 'rede', 'papel', 'seixo', 'rainha', 'cartão', 'sol', 'estrela', 'templo', 'dente', 'árvore',
  'troféu', 'aldeia', 'onda', 'poço', 'asa', 'lã', 'garagem', 'câmara', 'circo', 'rei', 'xadrez', 'caixão',
  // forma 2
  'cometa', 'boneca', 'gaveta', 'ovo', 'leque', 'portão', 'copo', 'ouro', 'colmeia', 'tinta', 'moinho', 'noz',
  'remo', 'caminho', 'tarte', 'alfinete', 'poça', 'rádio', 'telhado', 'rosa', 'sal', 'tesoura', 'seda', 'fumo',
  // forma 3
  'aranha', 'selo', 'degrau', 'açúcar', 'leite', 'tabuleiro', 'baú', 'tulipa', 'teia', 'baleia', 'minhoca', 'tela',
  'perfume', 'pão', 'coluna', 'mel', 'selva', 'bigorna', 'lagoa', 'avental', 'queijo', 'crachá', 'manteiga', 'azulejo',
  // forma 4
  'celeiro', 'vassoura', 'carrinho', 'giz', 'trevo', 'caranguejo', 'borracha', 'torneira', 'moldura', 'frigorífico', 'ampulheta', 'iglu',
  'colchão', 'microscópio', 'cogumelo', 'ostra', 'cadeado', 'paraquedas', 'pêndulo', 'jangada', 'espantalho', 'esponja', 'submarino', 'baloiço',
];

export const efficiency: string[] = [
  'dedal', 'tocha', 'iate', 'caracol', 'pires', 'postal', 'lustre', 'cálice', 'alavanca', 'tripé', 'caiaque', 'bolha',
  'meteoro', 'pinha', 'bolota', 'lavagante', 'cacto', 'canguru', 'peruca', 'esmeralda', 'harmónica', 'pergaminho', 'tartaruga', 'caldeirão',
];

export const names: string[] = [
  'João', 'Maria', 'Tiago', 'Inês', 'Miguel', 'Beatriz', 'Rui', 'Catarina', 'Pedro', 'Sofia',
  'Nuno', 'Marta', 'Duarte', 'Rita', 'Gonçalo', 'Leonor', 'Ricardo', 'Joana', 'Henrique', 'Teresa',
  'Vasco', 'Filipa', 'Afonso', 'Mariana', 'Diogo', 'Carolina', 'Bruno', 'Matilde', 'Tomás', 'Helena',
];

export const occupations: string[] = [
  'padeiro', 'piloto', 'professor', 'enfermeiro', 'carpinteiro', 'advogado', 'jardineiro', 'farmacêutico', 'pintor', 'agricultor', 'arquiteto', 'bibliotecário',
];
