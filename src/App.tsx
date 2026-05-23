import React, { useState, useCallback, useEffect, useRef } from 'react';
import Tesseract from 'tesseract.js';
import { Upload, Image as ImageIcon, Languages, Loader2, Trash2, ArrowRight, Crop } from 'lucide-react';
import ReactCrop, { type Crop as CropType, type PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import './index.css';

function App() {
  const [image, setImage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  
  // Crop state
  const [crop, setCrop] = useState<CropType>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [isCropping, setIsCropping] = useState(false);
  
  const [ocrText, setOcrText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [processStatus, setProcessStatus] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle Paste
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (e.clipboardData && e.clipboardData.items) {
        const items = e.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
          if (items[i].type.indexOf('image') !== -1) {
            const blob = items[i].getAsFile();
            if (blob) {
              loadImage(blob);
            }
            break;
          }
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  const loadImage = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      setImage(e.target?.result as string);
      setOcrText('');
      setTranslatedText('');
      setCrop(undefined);
      setCompletedCrop(null);
      setIsCropping(false);
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      loadImage(e.dataTransfer.files[0]);
    }
  }, []);

  // Helper to extract cropped image
  const getCroppedImageBlob = async (): Promise<string> => {
    if (!completedCrop || !imgRef.current) return image as string;

    const canvas = document.createElement('canvas');
    const scaleX = imgRef.current.naturalWidth / imgRef.current.width;
    const scaleY = imgRef.current.naturalHeight / imgRef.current.height;
    canvas.width = completedCrop.width * scaleX;
    canvas.height = completedCrop.height * scaleY;
    const ctx = canvas.getContext('2d');

    if (!ctx) return image as string;

    ctx.drawImage(
      imgRef.current,
      completedCrop.x * scaleX,
      completedCrop.y * scaleY,
      completedCrop.width * scaleX,
      completedCrop.height * scaleY,
      0,
      0,
      canvas.width,
      canvas.height
    );

    return canvas.toDataURL('image/png');
  };

  const processImage = async () => {
    if (!image) return;
    
    setIsProcessing(true);
    setProcessStatus('Đang chuẩn bị ảnh...');
    
    try {
      let targetImage = image;
      
      // If user has drawn a crop area, use the cropped part instead
      if (isCropping && completedCrop && completedCrop.width > 0 && completedCrop.height > 0) {
        targetImage = await getCroppedImageBlob();
      }

      setProcessStatus('Đang khởi tạo AI quét chữ (OCR)...');
      const worker = await Tesseract.createWorker('kor', 1, {
        logger: (m: any) => {
          if (m.status === 'recognizing text') {
            setProcessStatus(`Đang quét chữ... ${Math.round(m.progress * 100)}%`);
          }
        }
      });
      const { data: { text } } = await worker.recognize(targetImage);
      await worker.terminate();

      const cleanedText = text.trim();
      setOcrText(cleanedText);

      if (!cleanedText) {
        setTranslatedText('Không tìm thấy chữ nào trong ảnh.');
        setIsProcessing(false);
        return;
      }

      setProcessStatus('Đang dịch sang Tiếng Việt...');
      await translateText(cleanedText);
      
    } catch (error) {
      console.error(error);
      setTranslatedText('Có lỗi xảy ra trong quá trình xử lý.');
    } finally {
      setIsProcessing(false);
    }
  };

  const translateText = async (text: string) => {
    try {
      setProcessStatus('Đang dịch...');
      setIsProcessing(true);
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=ko&tl=vi&dt=t&q=${encodeURIComponent(text)}`;
      const response = await fetch(url);
      const json = await response.json();
      
      let translated = '';
      if (json && json[0]) {
        json[0].forEach((item: any) => {
          if (item[0]) translated += item[0];
        });
      }
      setTranslatedText(translated);
    } catch (error) {
      console.error("Translation Error:", error);
      setTranslatedText('Lỗi kết nối máy chủ dịch. Vui lòng thử lại sau.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="app-container">
      <header className="header">
        <h1>Lineage Translator</h1>
        <p>Chụp ảnh màn hình trong game &gt; Ấn Ctrl + V vào đây để dịch Tiếng Hàn sát nghĩa</p>
      </header>

      <div className="translator-layout">
        {/* Left Panel: Input */}
        <div className="panel">
          <h2 className="panel-title">
            <ImageIcon size={20} />
            Ảnh Game
          </h2>
          
          <div 
            className={`upload-area ${isDragging ? 'dragging' : ''} ${image ? 'has-image' : ''}`}
            style={{ padding: image ? '1rem' : '2rem' }}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
            onDrop={handleDrop}
            onClick={() => !image && fileInputRef.current?.click()}
          >
            {image ? (
              <div className="preview-container">
                {isCropping ? (
                  <ReactCrop
                    crop={crop}
                    onChange={(_, percentCrop) => setCrop(percentCrop)}
                    onComplete={(c) => setCompletedCrop(c)}
                  >
                    <img 
                      ref={imgRef}
                      src={image} 
                      alt="Crop Preview" 
                      className="preview-image" 
                      style={{ maxHeight: '500px' }}
                    />
                  </ReactCrop>
                ) : (
                  <img src={image} alt="Preview" className="preview-image" style={{ maxHeight: '500px' }} />
                )}
                
                <div className="controls">
                  <button className={`btn ${isCropping ? 'btn-primary' : ''}`} onClick={(e) => { e.stopPropagation(); setIsCropping(!isCropping); }} disabled={isProcessing}>
                    <Crop size={18} />
                    {isCropping ? 'Đã chọn xong vùng' : 'Cắt vùng chữ'}
                  </button>
                  <button className="btn btn-primary" onClick={(e) => { e.stopPropagation(); processImage(); }} disabled={isProcessing}>
                    {isProcessing ? <Loader2 size={18} className="loading-spinner" /> : <Languages size={18} />}
                    Quét & Dịch
                  </button>
                  <button className="btn" onClick={(e) => { e.stopPropagation(); setImage(null); }} disabled={isProcessing}>
                    <Trash2 size={18} />
                  </button>
                </div>
                {isCropping && (
                  <p style={{ fontSize: '0.8rem', color: 'var(--primary-color)', marginTop: '0.5rem' }}>
                    * Kéo thả chuột lên ảnh để khoanh vùng chữ cần dịch
                  </p>
                )}
              </div>
            ) : (
              <>
                <Upload size={48} className="upload-icon" />
                <p className="upload-text">
                  Kéo thả ảnh vào đây<br />hoặc <strong>Click để chọn</strong><br />hoặc nhấn <strong>Ctrl + V</strong> để dán
                </p>
              </>
            )}
            
            {isProcessing && (
              <div className="overlay">
                <Loader2 size={48} className="loading-spinner" color="var(--primary-color)" />
                <p className="overlay-text">{processStatus}</p>
              </div>
            )}
            
            <input type="file" className="hidden-input" ref={fileInputRef} accept="image/*" onChange={(e) => { if (e.target.files?.length) loadImage(e.target.files[0]); }} />
          </div>
        </div>

        {/* Right Panel: Result */}
        <div className="panel">
          <h2 className="panel-title">
            <Languages size={20} />
            Kết quả Dịch
          </h2>
          
          <div className="result-box" style={{ flex: 1 }}>
            <span className="result-label">Chữ Tiếng Hàn (Bạn có thể tự gõ/sửa)</span>
            <textarea 
              className="result-textarea" 
              value={ocrText}
              onChange={(e) => setOcrText(e.target.value)}
              placeholder="Kết quả quét chữ sẽ hiện ở đây..."
            />
          </div>
          
          <div style={{ display: 'flex', justifyContent: 'center', margin: '-10px 0 10px 0' }}>
             {ocrText && !isProcessing && (
               <button className="btn btn-primary" onClick={() => translateText(ocrText)} style={{ padding: '6px 16px', fontSize: '0.875rem', borderRadius: '20px' }}>
                 <ArrowRight size={16} /> Dịch lại đoạn Tiếng Hàn trên
               </button>
             )}
          </div>

          <div className="result-box" style={{ flex: 1, backgroundColor: 'rgba(201, 159, 74, 0.1)', borderColor: 'var(--primary-color)' }}>
            <span className="result-label" style={{ color: 'var(--primary-color)' }}>Tiếng Việt</span>
            <div className="result-text" style={{ flex: 1 }}>
              {translatedText || <span style={{ color: 'var(--text-muted)' }}>Bản dịch sát nghĩa sẽ hiện ở đây...</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
