/* Teste do novo fluxo de envio WhatsApp (JSDOM executa o HTML real) */
const fs = require('fs');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync('/home/ubuntu/upload/index-2-corrigido.html', 'utf8');
const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost',
    virtualConsole: (new (require('jsdom').VirtualConsole)()).sendTo(console, { omitJSDOMErrors: true })
});
const w = dom.window;

// ---- stubs de libs externas e APIs de navegador ----
class QRStub {
    static CorrectLevel = { L: 0, M: 1, Q: 2, H: 3 };
    constructor(el, opts) { el.dataset.qrText = opts.text; }
}
w.QRCode = QRStub;

// html2canvas stub: cria canvas com conteúdo simulado
w.html2canvas = async (el, opts) => {
    const canvas = w.document.createElement('canvas');
    canvas.width = 840; canvas.height = 600;
    canvas.toBlob = (cb) => {
        // polyfill de toBlob em JSDOM
        setTimeout(() => {
            try { canvas.toBlob = null; const blob = new w.Blob(['PNGDATA'], { type: 'image/png' }); cb(blob); }
            catch(e) { cb(new w.Blob(['PNGDATA'], { type: 'image/png' })); }
        }, 10);
    };
    return canvas;
};

// Blob/File polyfill simples para JSDOM
if (!w.Blob) w.Blob = class Blob {};
if (!w.File) w.File = class File extends w.Blob {
    constructor(parts, name, opts) { super(parts, opts); this.name = name; }
};
if (!w.URL) w.URL = {
    createObjectURL: () => 'blob:mock',
    revokeObjectURL: () => {}
};

// navigator.share stub: registra se foi chamado com arquivos
let shareCalled = false, sharePayload = null;
Object.defineProperty(w.navigator, 'share', {
    value: async (data) => { shareCalled = true; sharePayload = data; return; },
    writable: true, configurable: true
});
Object.defineProperty(w.navigator, 'canShare', {
    value: (data) => data.files && data.files.length > 0,
    writable: true, configurable: true
});

// localStorage config padrão
w.localStorage.setItem('ouze_store_config', JSON.stringify({
    pixKey: '75981236160', pixName: 'Edimundo Pereira', pixBank: 'Santander',
    pixCity: 'Feira de Santana', brandName: 'Ouxe', subName: 'Mini Mercado'
}));

// pedido de teste
w.orderItems = [
    { name: 'Leite Integral 1L', price: 6.50, qty: 2, emoji: '🥛' },
    { name: 'Pão Francês', price: 1.20, qty: 5, emoji: '🍞' }
];
// preenche campos do formulário de pedido
['orderName', 'orderPhone', 'orderCity', 'orderAddress', 'orderDiscount', 'orderChange', 'orderNotes'].forEach(id => {
    const el = w.document.getElementById(id);
    if (el) el.value = id === 'orderDiscount' ? '0' : 'teste';
});
const paymentSel = w.document.getElementById('orderPayment');
if (paymentSel) paymentSel.value = 'PIX';

let passed = 0, failed = 0;
function test(nome, ok) {
    if (ok) { passed++; console.log('  PASS:', nome); }
    else { failed++; console.log('  FAIL:', nome); }
}

(async () => {
    // 1) Verifica que as funções novas existem
    test('enviarPedidoWhatsApp existe', typeof w.enviarPedidoWhatsApp === 'function');
    test('renderizarPedidoPNG existe', typeof w.renderizarPedidoPNG === 'function');
    test('Texto antigo removido (encodeURIComponent(message))', !html.includes('encodeURIComponent(message)'));
    test('Card PNG oculto (left:-9999px)', html.includes('left:-9999px'));
    test('CSS do card PNG adicionado', html.includes('.order-png-card {'));

    // 2) Executa o fluxo completo de envio
    const result = await w.enviarPedidoWhatsApp({
        name: 'Maria Silva', phone: '(75) 98888-7777', city: 'Feira de Santana - BA',
        address: 'Rua A, 123, Centro', payment: 'PIX', change: '', notes: 'Sem lactose',
        subtotal: 19.00, discount: 0, total: 19.00, pixPayload: w.geraPixPayload(19.00)
    });

    test('enviarPedidoWhatsApp executou sem erro', result === true);
    test('Web Share API chamada com arquivo PNG', shareCalled === true);
    test('Compartilhado SOMENTE arquivo (sem text)', sharePayload && sharePayload.files && sharePayload.files.length === 1 && sharePayload.files[0].name === 'pedido-ouxemercado.png' && !sharePayload.text);
    test('Arquivo é image/png', sharePayload && sharePayload.files[0].type === 'image/png');

    // 3) Testa com pagamento não-PIX (QR não deve aparecer no PNG)
    if (paymentSel) paymentSel.value = 'Dinheiro';
    const result2 = await w.enviarPedidoWhatsApp({
        name: 'João', phone: '111', city: 'x', address: 'y', payment: 'Dinheiro',
        change: '50', notes: '', subtotal: 10, discount: 0, total: 10, pixPayload: ''
    });
    const pixWrap = w.document.getElementById('pngPixWrap');
    test('Envio não-PIX funciona', result2 === true);
    test('QR Pix oculto em pagamento não-PIX', pixWrap.style.display === 'none');

    // 4) Testa generateOrderPNG removido
    test('generateOrderPNG antigo removido', typeof w.generateOrderPNG === 'undefined');

    console.log(`\nRESULTADO: ${passed} PASS / ${failed} FAIL`);
    process.exit(failed > 0 ? 1 : 0);
})().catch(e => { console.error('ERRO FATAL:', e); process.exit(1); });
