
import React from 'react';
import { Mail, Phone, Globe, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';

const ContactInfo = ({ contactInfo }) => {
  if (!contactInfo) return null;

  const handleCopy = (text, type) => {
    navigator.clipboard.writeText(text).then(() => {
      toast({
        title: "📋 Kopiert!",
        description: `${type} wurde in die Zwischenablage kopiert.`
      });
    }).catch(() => {
      toast({
        title: "❌ Fehler",
        description: "Konnte nicht in die Zwischenablage kopieren."
      });
    });
  };

  const handleContact = (type, value) => {
    let action = '';
    let url = '';
    
    switch (type) {
      case 'email':
        action = 'E-Mail senden';
        url = `mailto:${value}`;
        break;
      case 'phone':
        action = 'Anrufen';
        url = `tel:${value}`;
        break;
      case 'website':
        action = 'Website öffnen';
        url = value.startsWith('http') ? value : `https://${value}`;
        break;
      default:
        return;
    }

    toast({
      title: `📞 ${action}`,
      description: "🚧 Diese Funktion ist noch nicht implementiert—aber keine Sorge! Du kannst sie in deinem nächsten Prompt anfordern! 🚀"
    });
  };

  const contactItems = [
    {
      type: 'email',
      icon: Mail,
      label: 'E-Mail',
      value: contactInfo.email,
      display: contactInfo.email
    },
    {
      type: 'phone',
      icon: Phone,
      label: 'Telefon',
      value: contactInfo.phone,
      display: contactInfo.phone
    },
    {
      type: 'website',
      icon: Globe,
      label: 'Website',
      value: contactInfo.website,
      display: contactInfo.website?.replace(/^https?:\/\//, '')
    }
  ].filter(item => item.value);

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Mail className="h-5 w-5 text-purple-400" />
        <h3 className="text-lg font-semibold text-white">Kontakt</h3>
      </div>

      <div className="space-y-3">
        {contactItems.map((item) => {
          const IconComponent = item.icon;
          
          return (
            <div key={item.type} className="flex items-center gap-3 p-3 bg-slate-800/40 backdrop-blur-sm rounded-lg border border-white/10">
              <div className="flex-shrink-0">
                <IconComponent className="h-4 w-4 text-purple-400" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="text-xs text-white/60 mb-1">{item.label}</div>
                <div className="text-sm font-medium text-white truncate">
                  {item.display}
                </div>
              </div>

              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleCopy(item.value, item.label)}
                  className="h-8 w-8 p-0"
                >
                  <Copy className="h-3 w-3" />
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleContact(item.type, item.value)}
                  className="h-8 px-3 text-xs"
                >
                  Kontakt
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ContactInfo;
