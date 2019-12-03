#random1 6gsFQoMjwfkfjwgppzjK6np1PKLTEvWZTN96RHprtm9t 5NiZkxxboVYh9haKC7miLG8sjbQnaaQCvqqbxbb6Qi9uhVY1mkiv37yh24WKvAYXxag6jzydhVw7U4r1G3ZrcdEJ
#random2 BxJtrTRehNH38dt9N5szDgXyFQtTe7JoxSrGdXXuKSDj 4GU1NUhz62VHnZxMVfJrRn489naWNt6P2q5qWGhACoFBLi27Xfq8svdmKd6yP8MtAAkcEHP124jtgn2Re4diUbLR

BOX=$(./bin/near box 5NiZkxxboVYh9haKC7miLG8sjbQnaaQCvqqbxbb6Qi9uhVY1mkiv37yh24WKvAYXxag6jzydhVw7U4r1G3ZrcdEJ BxJtrTRehNH38dt9N5szDgXyFQtTe7JoxSrGdXXuKSDj "hello mike" | tail -n 1)
echo $BOX

UNBOX=$(./bin/near unbox 4GU1NUhz62VHnZxMVfJrRn489naWNt6P2q5qWGhACoFBLi27Xfq8svdmKd6yP8MtAAkcEHP124jtgn2Re4diUbLR 6gsFQoMjwfkfjwgppzjK6np1PKLTEvWZTN96RHprtm9t $BOX | tail -n 1)
echo $UNBOX

if [[ ! "$UNBOX" =~ "hello mike" ]]; then
    echo FAILURE Unexpected unbox result, should be "hello mike"
    exit 1
fi
