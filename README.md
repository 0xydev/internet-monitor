# İnternet Bağlantı İzleyici

İnternet bağlantınızı izleyen, kesintileri kaydeden ve görselleştiren hafif bir uygulama.

## Özellikler

- İnternet bağlantısını düzenli aralıklarla kontrol eder
- Bağlantı kesintilerini kaydeder ve görselleştirir
- Kesinti sürelerini ve gecikme (ping) değerlerini gösterir
- Hafif ve düşük kaynak kullanımı
- Kullanıcı dostu web arayüzü
- Docker desteği

## Gereksinimler

- Go 1.16 veya üzeri (geliştirme için)
- Docker ve Docker Compose (çalıştırmak için)

## Kurulum

### Docker ile Kurulum (Önerilen)

1. Projeyi klonlayın:
   ```
   git clone https://github.com/0xydev/internet-monitor.git
   cd internet-monitor
   ```

2. Docker Compose ile çalıştırın:
   ```
   docker-compose up -d
   ```

3. Tarayıcınızda `http://localhost:8080` adresine gidin.

### Manuel Kurulum

1. Projeyi klonlayın:
   ```
   git clone https://github.com/0xydev/internet-monitor.git
   cd internet-monitor
   ```

2. Bağımlılıkları yükleyin:
   ```
   go mod download
   ```

3. Uygulamayı derleyin:
   ```
   go build -o internet-monitor ./cmd/server
   ```

4. Uygulamayı çalıştırın:
   ```
   ./internet-monitor
   ```

5. Tarayıcınızda `http://localhost:8080` adresine gidin.

## Yapılandırma

Aşağıdaki komut satırı parametrelerini kullanarak uygulamayı özelleştirebilirsiniz:

- `-port`: HTTP sunucusu portu (varsayılan: 8080)
- `-target`: Ping atılacak hedef (varsayılan: 8.8.8.8)
- `-interval`: Kontrol aralığı (saniye cinsinden, varsayılan: 5)
- `-data-dir`: Veri depolama dizini (varsayılan: ./data)
- `-static-dir`: Statik web dosyaları dizini (varsayılan: ./web/static)
- `-templates-dir`: HTML şablonları dizini (varsayılan: ./web/templates)

Docker Compose ile çalıştırırken, `docker-compose.yml` dosyasındaki environment değişkenlerini düzenleyebilirsiniz.

## Katkıda Bulunma

1. Bu projeyi fork edin
2. Kendi feature branch'inizi oluşturun (`git checkout -b feature/amazing-feature`)
3. Değişikliklerinizi commit edin (`git commit -m 'Add some amazing feature'`)
4. Branch'inizi push edin (`git push origin feature/amazing-feature`)
5. Pull Request açın

## Lisans

Bu proje MIT lisansı altında lisanslanmıştır. Daha fazla bilgi için `LICENSE` dosyasına bakın. 