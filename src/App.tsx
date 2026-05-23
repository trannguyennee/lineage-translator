import React, { useState, useEffect, useRef } from 'react';
import { Upload, Image as ImageIcon, Languages, Loader2, Trash2, Crop, Sparkles, Keyboard, Type } from 'lucide-react';
import ReactCrop, { type Crop as CropType } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import './index.css';

// --- UTILS FOR HANGUL TO QWERTY ---
const CHOSEONG_MAP = ['r', 'R', 's', 'e', 'E', 'f', 'a', 'q', 'Q', 't', 'T', 'd', 'w', 'W', 'c', 'z', 'x', 'v', 'g'];
const JUNGSEONG_MAP = ['k', 'o', 'i', 'O', 'j', 'p', 'u', 'P', 'h', 'hk', 'ho', 'hl', 'y', 'n', 'nj', 'np', 'nl', 'b', 'm', 'ml', 'l'];
const JONGSEONG_MAP = ['', 'r', 'R', 'rt', 's', 'sw', 'sg', 'e', 'f', 'fr', 'fa', 'fq', 'ft', 'fx', 'fv', 'fg', 'a', 'q', 'qt', 't', 'T', 'd', 'w', 'c', 'z', 'x', 'v', 'g'];

const hangulToQwerty = (text: string) => {
  let result = "";
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (0xAC00 <= code && code <= 0xD7A3) {
      const index = code - 0xAC00;
      result += CHOSEONG_MAP[Math.floor(index / 588)];
      result += JUNGSEONG_MAP[Math.floor((index % 588) / 28)];
      result += JONGSEONG_MAP[index % 28];
    } else {
      result += text[i];
    }
  }
  return result;
};

const isKorean = (text: string) => {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (0xAC00 <= code && code <= 0xD7A3) {
      return true;
    }
  }
  return false;
};

// --- MAIN APP COMPONENT ---
function App() {
  const [activeTab, setActiveTab] = useState<'image' | 'text'>('image');
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

  // Image Tab States
  const [image, setImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processStatus, setProcessStatus] = useState('');
  const [ocrText, setOcrText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [aiAnalysis, setAiAnalysis] = useState('');
  const [crop, setCrop] = useState<CropType>();
  const [completedCrop, setCompletedCrop] = useState<CropType | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Text Tab States
  const [textInput, setTextInput] = useState('');
  const [isTextProcessing, setIsTextProcessing] = useState(false);
  const [textTranslation, setTextTranslation] = useState('');
  const [textQwerty, setTextQwerty] = useState('');

  // Handle Paste Image
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (activeTab !== 'image') return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const blob = items[i].getAsFile();
          if (blob) {
            const reader = new FileReader();
            reader.onload = (event) => {
              setImage(event.target?.result as string);
              setOcrText(''); setTranslatedText(''); setAiAnalysis('');
            };
            reader.readAsDataURL(blob);
          }
          break;
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [activeTab]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setImage(event.target?.result as string);
        setOcrText(''); setTranslatedText(''); setAiAnalysis('');
      };
      reader.readAsDataURL(file);
    }
  };

  const getCroppedImg = async (imageSrc: string, pixelCrop: CropType): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = pixelCrop.width;
        canvas.height = pixelCrop.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(imageSrc);
        ctx.drawImage(img, pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height, 0, 0, pixelCrop.width, pixelCrop.height);
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = imageSrc;
    });
  };

  const callGeminiVision = async (base64Image: string) => {
    if (!apiKey || apiKey === 'nhập_key_của_bạn_vào_đây') {
      alert("Chủ trang web chưa cấu hình Gemini API Key ngầm. Vui lòng thêm VITE_GEMINI_API_KEY vào file .env!");
      return;
    }
    try {
      setIsProcessing(true);
      setProcessStatus('Đang gửi ảnh cho AI phân tích...');
      const base64Data = base64Image.split(',')[1];
      
      const promptText = `Bạn là chuyên gia Lineage. Đọc chữ tiếng Hàn trong ảnh, trả về 1 đối tượng JSON duy nhất (không bọc trong markdown):
{
  "korean_text": "Chữ tiếng Hàn gốc",
  "vietnamese_translation": "Bản dịch tự nhiên",
  "analysis": "Phân tích bối cảnh"
}
Từ điển: 방=lượt buff, 헤이=Haste, 가능=Có thể, 판도라=Pandora, 축=Chúc phúc, 저주=Nguyền rủa.`;

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptText }, { inline_data: { mime_type: "image/png", data: base64Data } }] }]
        })
      });

      const data = await response.json();
      if (data.error) {
        const errorMsg = data.error.message || '';
        if (data.error.code === 429 || errorMsg.toLowerCase().includes('quota')) {
          throw new Error(`Bạn đang quét quá nhanh! Giới hạn miễn phí là 20 ảnh/phút. Vui lòng đợi 1 phút. Lỗi gốc: ${errorMsg}`);
        }
        throw new Error(errorMsg || 'Lỗi từ Gemini API');
      }

      const aiText = data.candidates[0].content.parts[0].text;
      let resultObj;
      try {
        resultObj = JSON.parse(aiText.replace(/```json/g, '').replace(/```/g, '').trim());
      } catch (e) {
        throw new Error("AI trả về định dạng không đúng. Vui lòng thử lại.");
      }

      setOcrText(resultObj.korean_text);
      setTranslatedText(resultObj.vietnamese_translation);
      setAiAnalysis(resultObj.analysis);
      
    } catch (error: any) {
      alert('Lỗi: ' + error.message);
    } finally {
      setIsProcessing(false);
      setProcessStatus('');
    }
  };

  const handleProcessImage = async () => {
    if (!image) return;
    let imageToProcess = image;
    if (completedCrop && completedCrop.width > 0 && completedCrop.height > 0) {
      imageToProcess = await getCroppedImg(image, completedCrop);
    }
    await callGeminiVision(imageToProcess);
  };

  const callGeminiText = async () => {
    if (!textInput.trim()) return;
    if (!apiKey || apiKey === 'nhập_key_của_bạn_vào_đây') {
      alert("Thiếu API Key trong cấu hình (.env)!"); 
      return;
    }

    setIsTextProcessing(true);
    setTextTranslation('');
    setTextQwerty('');

    const isKo = isKorean(textInput);
    const direction = isKo ? 'tiếng Hàn sang tiếng Việt' : 'tiếng Việt sang tiếng Hàn';

    const promptText = `Bạn là một chuyên gia dịch thuật thông dịch cho game thủ Việt Nam chơi server Hàn Quốc. 
Hãy dịch đoạn văn bản sau từ ${direction}. 
Yêu cầu: Chỉ trả về ĐÚNG MỘT ĐOẠN VĂN BẢN KẾT QUẢ, không có nháy kép, không có lời dạo đầu, không giải thích.

Văn bản cần dịch:
${textInput}`;

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptText }] }]
        })
      });

      const data = await response.json();
      if (data.error) throw new Error(data.error.message || 'Lỗi API');
      
      let aiText = data.candidates[0].content.parts[0].text.trim();
      setTextTranslation(aiText);
      
      if (!isKo) {
        // Output is Korean, compute QWERTY keys
        setTextQwerty(hangulToQwerty(aiText));
      }
    } catch (e: any) {
      alert("Lỗi: " + e.message);
    } finally {
      setIsTextProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-amber-500/30">
      <div className="max-w-6xl mx-auto p-4 sm:p-8">
        
        {/* HEADER */}
        <header className="w-full mb-12 flex flex-col items-center justify-center gap-6 text-center border-b border-slate-800/80 pb-8">
          <div className="flex flex-col items-center justify-center w-full">
            <h1 className="text-4xl sm:text-5xl font-extrabold flex items-center justify-center gap-3 drop-shadow-md">
              <Sparkles className="text-amber-400" size={36} />
              <span className="bg-gradient-to-r from-amber-400 to-amber-200 bg-clip-text text-transparent">Lineage</span> 
              <span className="text-white">Translator AI</span>
            </h1>
            <p className="text-slate-400 mt-3 text-lg font-medium">Trợ lý ngôn ngữ thông minh dành cho game thủ Lineage</p>
          </div>
          
          {/* TABS NAVIGATION */}
          <div className="inline-flex items-center justify-center bg-slate-900/90 p-1.5 rounded-xl border border-slate-700/50 shadow-inner">
            <button
              onClick={() => setActiveTab('image')}
              className={`flex items-center justify-center gap-2 px-8 py-3 rounded-lg font-bold transition-all duration-300 whitespace-nowrap min-w-[200px] ${activeTab === 'image' ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/30 transform scale-[1.02]' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
            >
              <ImageIcon size={20} /> Quét Ảnh Game
            </button>
            <button
              onClick={() => setActiveTab('text')}
              className={`flex items-center justify-center gap-2 px-8 py-3 rounded-lg font-bold transition-all duration-300 whitespace-nowrap min-w-[200px] ${activeTab === 'text' ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/30 transform scale-[1.02]' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
            >
              <Type size={20} /> Dịch Văn Bản
            </button>
          </div>
        </header>

        {/* TAB CONTENT: IMAGE TRANSLATION */}
        {activeTab === 'image' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Image Upload Panel */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden group">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-500 to-transparent opacity-50"></div>
              <h2 className="text-xl font-bold mb-6 flex items-center gap-2 text-white">
                <ImageIcon className="text-amber-400" /> Hình Ảnh Đầu Vào
              </h2>
              
              {!image ? (
                <label className="flex flex-col items-center justify-center w-full h-72 bg-slate-800/50 border-2 border-dashed border-slate-700 rounded-xl cursor-pointer hover:border-amber-400/50 hover:bg-amber-400/5 transition-all duration-300">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <Upload className="w-12 h-12 mb-4 text-slate-500" />
                    <p className="mb-2 text-slate-300"><span className="font-bold text-white">Nhấn để tải lên</span> hoặc Ctrl+V để dán ảnh</p>
                    <p className="text-sm text-slate-500">Hỗ trợ PNG, JPG</p>
                  </div>
                  <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
                </label>
              ) : (
                <div className="flex flex-col gap-4">
                  <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-950 shadow-inner flex items-center justify-center min-h-[16rem]">
                    <ReactCrop crop={crop} onChange={c => setCrop(c)} onComplete={c => setCompletedCrop(c)}>
                      <img ref={imageRef} src={image} alt="Screenshot" className="max-w-full max-h-[60vh] object-contain" />
                    </ReactCrop>
                  </div>
                  <p className="text-sm text-slate-400 flex items-center justify-center gap-2">
                    <Crop size={16} /> Quét chuột lên vùng chữ để AI dịch chuẩn hơn
                  </p>
                  <div className="flex gap-3 mt-2">
                    <button
                      onClick={handleProcessImage}
                      disabled={isProcessing}
                      className="flex-1 flex items-center justify-center gap-2 bg-amber-500 text-slate-950 font-bold py-4 px-6 rounded-xl hover:bg-amber-400 active:scale-[0.98] transition-all shadow-lg shadow-amber-500/20 disabled:opacity-50 disabled:active:scale-100"
                    >
                      {isProcessing ? <><Loader2 className="animate-spin" size={20} /> {processStatus}</> : <><Sparkles size={20} /> Phân Tích Bằng AI</>}
                    </button>
                    <button
                      onClick={() => { setImage(null); setOcrText(''); setTranslatedText(''); setAiAnalysis(''); }}
                      className="flex items-center justify-center p-4 bg-slate-800 border border-slate-700 rounded-xl hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/50 transition-all"
                      title="Xóa ảnh"
                    >
                      <Trash2 size={22} />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* AI Results Panel */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-3xl"></div>
              <h2 className="text-xl font-bold mb-6 flex items-center gap-2 text-white relative z-10">
                <Languages className="text-amber-400" /> Kết Quả Dịch & Phân Tích
              </h2>
              
              <div className="flex-1 flex flex-col gap-6 relative z-10">
                <div className="bg-slate-800/50 p-5 rounded-xl border border-slate-700/50 shadow-inner">
                  <span className="text-xs font-bold text-slate-400 tracking-widest uppercase mb-3 block">Chữ Tiếng Hàn</span>
                  {ocrText ? <p className="text-lg font-medium text-slate-200 whitespace-pre-wrap">{ocrText}</p> : <p className="text-slate-500 italic">Đang chờ hình ảnh...</p>}
                </div>

                <div className="bg-amber-500/5 p-5 rounded-xl border border-amber-500/20 shadow-inner">
                  <span className="text-xs font-bold text-amber-500 tracking-widest uppercase mb-3 block">Bản Dịch Tiếng Việt</span>
                  {translatedText ? <p className="text-xl font-bold text-amber-50 whitespace-pre-wrap">{translatedText}</p> : <p className="text-slate-500 italic">Bản dịch sẽ hiển thị ở đây...</p>}
                </div>

                <div className="bg-slate-800/50 p-5 rounded-xl border border-slate-700/50 shadow-inner flex-1">
                  <span className="text-xs font-bold text-slate-400 tracking-widest uppercase mb-3 block">Góc Chuyên Gia AI</span>
                  {aiAnalysis ? <p className="text-slate-300 whitespace-pre-wrap leading-relaxed">{aiAnalysis}</p> : <p className="text-slate-500 italic">Phân tích tình huống game...</p>}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB CONTENT: TEXT TRANSLATION */}
        {activeTab === 'text' && (
          <div className="max-w-3xl mx-auto bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="absolute top-0 right-0 w-full h-1 bg-gradient-to-r from-blue-500 to-transparent opacity-50"></div>
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2 text-white">
              <Type className="text-blue-400" /> Dịch Chữ Nhanh
            </h2>

            <div className="flex flex-col gap-6">
              <div>
                <label className="block text-sm font-bold text-slate-400 mb-2 uppercase tracking-wide">Nhập nội dung cần dịch</label>
                <textarea 
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder="Nhập tiếng Hàn hoặc tiếng Việt vào đây..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl p-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all resize-y min-h-[120px]"
                ></textarea>
              </div>

              <button
                onClick={callGeminiText}
                disabled={isTextProcessing || !textInput.trim()}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white font-bold py-4 px-6 rounded-xl hover:bg-blue-500 active:scale-[0.98] transition-all shadow-lg shadow-blue-600/20 disabled:opacity-50 disabled:active:scale-100"
              >
                {isTextProcessing ? <><Loader2 className="animate-spin" size={20} /> Đang dịch thuật...</> : <><Languages size={20} /> Dịch Ngay (Tự động nhận diện)</>}
              </button>

              {textTranslation && (
                <div className="mt-4 flex flex-col gap-4 animate-in fade-in duration-300">
                  <div className="bg-slate-800/80 p-5 rounded-xl border border-slate-600 shadow-inner">
                    <span className="text-xs font-bold text-blue-400 tracking-widest uppercase mb-3 block">Kết Quả Dịch</span>
                    <p className="text-2xl font-bold text-white whitespace-pre-wrap">{textTranslation}</p>
                  </div>

                  {textQwerty && (
                    <div className="bg-slate-950 p-5 rounded-xl border border-slate-800 shadow-inner relative overflow-hidden">
                      <div className="absolute right-0 top-0 opacity-10">
                        <Keyboard size={120} />
                      </div>
                      <span className="text-xs font-bold text-slate-400 tracking-widest uppercase mb-3 block flex items-center gap-2">
                        <Keyboard size={16} /> Cách Gõ Phím (QWERTY)
                      </span>
                      <p className="text-xl font-mono text-amber-400 tracking-wider break-all">{textQwerty}</p>
                      <p className="text-sm text-slate-500 mt-3">Nhập các ký tự trên bằng bàn phím tiếng Hàn để viết ra chữ này trong game.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

export default App;
