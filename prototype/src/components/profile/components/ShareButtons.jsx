
import React from 'react';
import { Share2, Facebook, Twitter, Mail, Link, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';

const ShareButtons = () => {
  const currentUrl = window.location.href;
  const shareTitle = "Schau dir dieses interessante Profil an!";

  const handleShare = (platform) => {
    let shareUrl = '';
    let action = '';

    switch (platform) {
      case 'facebook':
        action = 'Auf Facebook teilen';
        shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(currentUrl)}`;
        window.open(shareUrl, '_blank');
        break;
      case 'twitter':
        action = 'Auf Twitter teilen';
        shareUrl = `https://twitter.com/intent/tweet?url=${encodeURIComponent(currentUrl)}&text=${encodeURIComponent(shareTitle)}`;
        window.open(shareUrl, '_blank');
        break;
      case 'whatsapp':
        action = 'Über WhatsApp teilen';
        shareUrl = `https://wa.me/?text=${encodeURIComponent(shareTitle + ' ' + currentUrl)}`;
        window.open(shareUrl, '_blank');
        break;
      case 'email':
        action = 'Per E-Mail teilen';
        shareUrl = `mailto:?subject=${encodeURIComponent(shareTitle)}&body=${encodeURIComponent(shareTitle + '\n\n' + currentUrl)}`;
        window.location.href = shareUrl;
        break;
      case 'copy':
        action = 'Link kopieren';
        navigator.clipboard.writeText(currentUrl).then(() => {
          toast({
            title: "🔗 Link kopiert!",
            description: "Der Link wurde in die Zwischenablage kopiert."
          });
        }).catch(() => {
          toast({
            title: "❌ Fehler",
            description: "Konnte den Link nicht kopieren."
          });
        });
        return;
      default:
        return;
    }
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: shareTitle,
          url: currentUrl
        });
      } catch (error) {
        if (error.name !== 'AbortError') {
          toast({
            title: "❌ Fehler beim Teilen",
            description: "Das Teilen wurde abgebrochen oder ist nicht möglich."
          });
        }
      }
    } else {
      toast({
        title: "📤 Teilen",
        description: "Dein Browser unterstützt diese Funktion leider nicht."
      });
    }
  };

  const shareButtons = [
    {
      platform: 'facebook',
      icon: Facebook,
      label: 'Facebook',
      color: 'hover:bg-blue-50 hover:text-blue-600'
    },
    {
      platform: 'twitter',
      icon: Twitter,
      label: 'Twitter',
      color: 'hover:bg-sky-50 hover:text-sky-600'
    },
    {
      platform: 'whatsapp',
      icon: MessageCircle,
      label: 'WhatsApp',
      color: 'hover:bg-green-50 hover:text-green-600'
    },
    {
      platform: 'email',
      icon: Mail,
      label: 'E-Mail',
      color: 'hover:bg-gray-50 hover:text-gray-600'
    }
  ];

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Share2 className="h-5 w-5 text-purple-600" />
        <h3 className="text-lg font-semibold text-gray-900">Teilen</h3>
      </div>

      
      {navigator.share && (
        <Button
          onClick={handleNativeShare}
          className="w-full mb-4 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
        >
          <Share2 className="h-4 w-4 mr-2" />
          Teilen
        </Button>
      )}

      
      <div className="grid grid-cols-2 gap-2 mb-4">
        {shareButtons.map((button) => {
          const IconComponent = button.icon;
          
          return (
            <Button
              key={button.platform}
              variant="outline"
              size="sm"
              onClick={() => handleShare(button.platform)}
              className={`flex items-center gap-2 ${button.color}`}
            >
              <IconComponent className="h-4 w-4" />
              <span className="text-xs">{button.label}</span>
            </Button>
          );
        })}
      </div>

      
      <Button
        variant="outline"
        size="sm"
        onClick={() => handleShare('copy')}
        className="w-full flex items-center gap-2 hover:bg-purple-50 hover:text-purple-600"
      >
        <Link className="h-4 w-4" />
        Link kopieren
      </Button>
    </div>
  );
};

export default ShareButtons;
